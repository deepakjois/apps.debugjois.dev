import * as cdk from "aws-cdk-lib";
import * as events from "aws-cdk-lib/aws-events";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

const deepgramAPIKeySecretName = "apps-debugjois-dev/deepgram-api-key";
// Created outside this stack (see infra README) so the Lambda's dynamic
// reference never resolves a new, still-empty secret on first deploy.
const minifluxAPITokenSecretName = "apps-debugjois-dev/miniflux-api-token";
const transcriptBucketArn = "arn:aws:s3:::debugjois-dev-site";

export class AppDebugJoisDevBackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    const backendImageUri = new cdk.CfnParameter(this, "BackendImageUri", {
      description:
        "Immutable ECR image URI for the backend Lambda, for example repo@sha256:...",
      type: "String",
    });

    const deepgramAPIKeySecret = new secretsmanager.CfnSecret(
      this,
      "DeepgramAPIKeySecret",
      {
        description: "Deepgram API key for the apps.debugjois.dev backend",
        name: deepgramAPIKeySecretName,
      },
    );
    deepgramAPIKeySecret.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    const transcriptBucket = s3.Bucket.fromBucketArn(
      this,
      "TranscriptBucket",
      transcriptBucketArn,
    );

    const backendRole = new iam.Role(this, "BackendLambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole",
        ),
      ],
      roleName: "apps-debugjois-dev-backend-lambda-role",
    });

    transcriptBucket.grantReadWrite(backendRole);

    const backendLambda = new lambda.CfnFunction(this, "BackendLambda", {
      architectures: ["x86_64"],
      code: {
        imageUri: backendImageUri.valueAsString,
      },
      description: "apps.debugjois.dev backend Lambda",
      environment: {
        variables: {
          DEEPGRAM_API_KEY: `{{resolve:secretsmanager:${deepgramAPIKeySecretName}}}`,
          GOOGLE_APPLICATION_CREDENTIALS: "/gcp-credentials.json",
          MINIFLUX_API_TOKEN: `{{resolve:secretsmanager:${minifluxAPITokenSecretName}}}`,
        },
      },
      memorySize: 1024,
      packageType: "Image",
      role: backendRole.roleArn,
      timeout: 900,
    });
    backendLambda.node.addDependency(deepgramAPIKeySecret);

    // queue-podcast-transcription self-invokes this Lambda asynchronously, and
    // queue-miniflux-starred synchronously invokes queue-podcast-transcription.
    new iam.Policy(this, "BackendLambdaSelfInvokePolicy", {
      roles: [backendRole],
      statements: [
        new iam.PolicyStatement({
          actions: ["lambda:InvokeFunction"],
          resources: [backendLambda.attrArn],
        }),
      ],
    });

    // Daily run of queue-miniflux-starred. The constant target input replaces
    // the EventBridge event, so the Lambda sees a plain direct-invocation
    // payload. EventBridge rule cron is UTC-only: 04:00 UTC is 05:00 Berlin in
    // winter (CET) and 06:00 in summer (CEST).
    const queueMinifluxStarredRule = new events.CfnRule(
      this,
      "QueueMinifluxStarredRule",
      {
        description:
          "Queue starred Miniflux podcast entries for transcription once a day",
        scheduleExpression: "cron(0 4 * * ? *)",
        state: "ENABLED",
        targets: [
          {
            arn: backendLambda.attrArn,
            id: "BackendLambda",
            input: JSON.stringify({ action: "queue-miniflux-starred" }),
          },
        ],
      },
    );

    // Resource-based permission letting only that rule invoke the Lambda, so
    // EventBridge needs no IAM role.
    new lambda.CfnPermission(this, "QueueMinifluxStarredRuleInvokePermission", {
      action: "lambda:InvokeFunction",
      functionName: backendLambda.attrArn,
      principal: "events.amazonaws.com",
      sourceArn: queueMinifluxStarredRule.attrArn,
    });

    new cdk.CfnOutput(this, "LambdaFunctionArn", {
      value: backendLambda.attrArn,
      description: "Backend Lambda function ARN",
    });
    new cdk.CfnOutput(this, "LambdaFunctionName", {
      value: backendLambda.ref,
      description: "Backend Lambda function name",
    });
    new cdk.CfnOutput(this, "BackendDeployedImageUri", {
      value: backendImageUri.valueAsString,
      description: "Backend Lambda image URI",
    });
    new cdk.CfnOutput(this, "BackendLambdaRoleArn", {
      value: backendRole.roleArn,
      description: "Backend Lambda execution role ARN",
    });
    new cdk.CfnOutput(this, "DeepgramAPIKeySecretArn", {
      value: deepgramAPIKeySecret.attrId,
      description: "Secrets Manager ARN for the Deepgram API key",
    });
    new cdk.CfnOutput(this, "DeepgramAPIKeySecretName", {
      value: deepgramAPIKeySecretName,
      description: "Secrets Manager name for the Deepgram API key",
    });
    new cdk.CfnOutput(this, "MinifluxAPITokenSecretName", {
      value: minifluxAPITokenSecretName,
      description: "Secrets Manager name for the Miniflux API token",
    });
  }
}
