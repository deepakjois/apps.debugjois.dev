import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

// Account-wide GitHub Actions OIDC provider ARN. The provider itself is
// owned out-of-band by another CDK stack (debugjois.dev/InfraStack) because
// AWS only permits a single OIDC provider per issuer per account. We only
// reference it here by ARN to build the role's trust policy.
const GITHUB_OIDC_PROVIDER_ARN =
  "arn:aws:iam::654654546088:oidc-provider/token.actions.githubusercontent.com";

export class AppsDebugJoisDevArtifactStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    // Stores uploaded Lambda zip artifacts for the site stack.
    const artifactBucket = new s3.Bucket(this, "ArtifactBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      versioned: true,
    });

    new cdk.CfnOutput(this, "ArtifactBucketName", {
      value: artifactBucket.bucketName,
      description: "S3 bucket for uploaded apps.debugjois.dev Lambda artifacts",
    });

    new cdk.CfnOutput(this, "ArtifactBucketArn", {
      value: artifactBucket.bucketArn,
      description: "ARN for the apps.debugjois.dev Lambda artifact bucket",
    });

    // IAM role assumed by GitHub Actions via OIDC for this repo's main branch.
    // Imported into CDK from the pre-existing hand-made role of the same name.
    const githubActionsRole = new iam.Role(this, "GitHubActionsRole", {
      roleName: "apps-debugjois-dev-github-actions-role",
      description: "GitHub Actions OIDC role for deepakjois/apps.debugjois.dev",
      assumedBy: new iam.FederatedPrincipal(
        GITHUB_OIDC_PROVIDER_ARN,
        {
          StringEquals: {
            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
            "token.actions.githubusercontent.com:sub":
              "repo:deepakjois/apps.debugjois.dev:ref:refs/heads/main",
          },
        },
        "sts:AssumeRoleWithWebIdentity",
      ),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess"),
      ],
      maxSessionDuration: cdk.Duration.hours(1),
    });

    new cdk.CfnOutput(this, "GitHubActionsRoleArn", {
      value: githubActionsRole.roleArn,
      description: "ARN of the GitHub Actions OIDC role for this repo",
    });
  }
}
