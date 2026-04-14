## Version Control
When developing locally, this repo uses Jujutsu (jj) as the version control system, on top of a colocated Git repo. If you are in a worktree, the colocated Git repo will be found in the default location indicated in .jj/repo 

Always attempt to use jj first, falling back to Git only if there are no traces of jj.

## READMEs
READMEs should contain instructions to
- get started with development
- instructions to run any tools that are part of the codebase

Always update the README if something changes in either of those categories.

Always read the READMEs before reading the code when trying to figure out something.

## AWS
Use the aws CLI tool to check the resources in AWS and monitor logs. Ensure you are logged and if not prompt the user to login separately and return.

For logs, prefer `aws logs start-query` instead of `aws logs filter` because the former sometimes handles things like UUIDs better.

## Github Actions Convention
Keep workflow YAML files declarative. Do not inline multiline or complex bash in `run:` blocks — extract any non-trivial shell logic into a script under .github/scripts/ and call it from the workflow step.
