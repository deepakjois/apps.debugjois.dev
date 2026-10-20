import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

// The GitHub OIDC provider is managed outside this stack. AWS permits one OIDC provider per issuer
// per account.
const GITHUB_OIDC_PROVIDER_ARN =
  "arn:aws:iam::654654546088:oidc-provider/token.actions.githubusercontent.com";

export class AppsDebugJoisDevAccessStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    const cloudFormationServiceRole = new iam.Role(
      this,
      "CloudFormationServiceRole",
      {
        roleName: "apps-debugjois-dev-cloudformation-role",
        description:
          "CloudFormation service role for deepakjois/apps.debugjois.dev",
        assumedBy: new iam.ServicePrincipal("cloudformation.amazonaws.com"),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess"),
        ],
      },
    );

    cloudFormationServiceRole.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

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

    githubActionsRole.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    new cdk.CfnOutput(this, "CloudFormationServiceRoleArn", {
      value: cloudFormationServiceRole.roleArn,
      description:
        "ARN of the CloudFormation service role for apps.debugjois.dev",
    });

    new cdk.CfnOutput(this, "GitHubActionsRoleArn", {
      value: githubActionsRole.roleArn,
      description: "ARN of the GitHub Actions OIDC role for this repo",
    });
  }
}
