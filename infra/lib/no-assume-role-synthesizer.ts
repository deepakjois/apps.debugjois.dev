import * as cdk from "aws-cdk-lib";
import type { ISynthesisSession } from "aws-cdk-lib";

export interface NoAssumeRoleSynthesizerProps {
  qualifier?: string;
  cloudFormationExecutionRoleArn?: string;
}

/**
 * Custom synthesizer that behaves like BootstraplessSynthesizer for assets
 * (i.e. no asset support), but omits assumeRoleArn from the synthesized
 * manifest so deploys use the caller's current credentials directly.
 */
export class NoAssumeRoleSynthesizer extends cdk.BootstraplessSynthesizer {
  private readonly explicitCloudFormationExecutionRoleArn?: string;

  constructor(props: NoAssumeRoleSynthesizerProps = {}) {
    super({
      qualifier: props.qualifier,
      cloudFormationExecutionRoleArn: props.cloudFormationExecutionRoleArn,
    });
    this.explicitCloudFormationExecutionRoleArn =
      props.cloudFormationExecutionRoleArn;
  }

  override synthesize(session: ISynthesisSession): void {
    this.synthesizeStackTemplate(this.boundStack, session);
    this.emitArtifact(
      session,
      this.explicitCloudFormationExecutionRoleArn
        ? {
            cloudFormationExecutionRoleArn:
              this.explicitCloudFormationExecutionRoleArn,
          }
        : {},
    );
  }
}
