import * as cdk from "aws-cdk-lib";
import type { ISynthesisSession } from "aws-cdk-lib";

export interface NoAssumeRoleSynthesizerProps {
  qualifier?: string;
  cloudFormationExecutionRoleArn?: string;
}

/**
 * Maintainer note:
 *
 * We use this custom synthesizer so `cdk deploy` uses the caller's current
 * credentials directly instead of emitting a default bootstrap-style
 * `assumeRoleArn` in the cloud assembly manifest. For app stacks, we can still
 * optionally emit `cloudFormationExecutionRoleArn` so CloudFormation executes
 * changes with the dedicated service role.
 *
 * This intentionally subclasses `BootstraplessSynthesizer` and overrides only
 * `synthesize()` to customize the artifact metadata emitted via
 * `StackSynthesizer.emitArtifact()`.
 *
 * Relevant AWS docs:
 * - StackSynthesizer:
 *   https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.StackSynthesizer.html
 * - BootstraplessSynthesizer:
 *   https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.BootstraplessSynthesizer.html
 * - DefaultStackSynthesizer:
 *   https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.DefaultStackSynthesizer.html
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
