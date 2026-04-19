import * as cdk from "aws-cdk-lib";

/**
 * Custom synthesizer that behaves like BootstraplessSynthesizer for assets
 * (i.e. no asset support), but omits assumeRoleArn from the synthesized
 * manifest so deploys use the caller's current credentials directly.
 */
export class NoAssumeRoleSynthesizer extends cdk.BootstraplessSynthesizer {
  override synthesize(session: any): void {
    this.synthesizeStackTemplate(this.boundStack, session);
    this.emitArtifact(session, {
      cloudFormationExecutionRoleArn: this.cloudFormationExecutionRoleArn,
    });
  }
}
