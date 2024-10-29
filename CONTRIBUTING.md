# Contributing guidelines

First of all, thanks for considering contributing!

## I want to contribute, what should I work on?

You can help mostly by:

* **Adding ideas** to improve the UI
* **Reporting problems**.
* **Working on the issues marked as help wanted**. 
  * Comment on the issue and check if any additional context is needed before you start working. This will also help everyone knows that you are already working on it.

## Add your changes

Do you have your contribution ready? If so, keep reading.

Although it is possible to make your changes directly through the GitHub web interface, we recommend that you add your changes to a local copy of the repository.

**Which branch should I use?**<br>
If your are not doing a lot of changes you can use `main`, otherwise we encourage you to do the changes in a new branch. Branch name convention:
* For changes associated with an issue: `<username>/<issue-description>-<issue-id>`.
* For changes without an associated issue: `<username>/<issue-description>`.

## Commit message format

This project do not strictly follows [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/), but we will use the format `<type>: description [optional #issue-number]` to generate the changelog. Be sure to provide clear and sufficient information in commit messages. 

For `<type>` you should use:

* **feat**: A new feature
* **fix**: A bug fix 
* **docs**: Documentation only changes (changes in markdown)
* **style**: Changes that do not affect the meaning of the code (conventions, white-space, formatting, missing semi-colons, etc)
* **refactor**: A code change that neither fixes a bug nor adds a feature

`description`:

* The subject contains succinct description of the change
* use the imperative, present tense: "change" not "changed" nor "changes"
* do not capitalize first letter
* do not place a period . at the end
* entire length of the subject must not go over 50 characters
* describe what the commit does, not what issue it relates to or fixes
* **be brief, yet descriptive** - we should have a good understanding of what the commit does by reading the subject

**Examples:**
* `style: apply code conventions #30`
* `doc: update contributing guidelines and minor conventions changes #37`

## Pull request

When submitting:
* If you are adding a new snippet, please provide a codepen example to help during the review process.
* If you are working on an issue, remember to [link your PR to it](https://docs.github.com/en/issues/tracking-your-work-with-issues/linking-a-pull-request-to-an-issue), by use a supported keyword in the pull request description. For example: "`Closes #10`" or "`Fixes hhkaos/esridevs-social-activity#10`".