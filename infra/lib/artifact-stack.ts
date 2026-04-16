import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

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
  }
}
