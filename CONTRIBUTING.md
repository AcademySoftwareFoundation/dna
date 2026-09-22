<!-- SPDX-License-Identifier: CC-BY-4.0 -->
<!-- Copyright Contributors to the Dailies Notes Assistant Project. -->


Contributing to the DNA Project
===============================

Thank you for contributing to DNA. This guide explains how to report
issues, submit changes, and meet the project's contribution requirements.


Communications
--------------

* [ASWF Slack](https://slack.aswf.io) -- join for the `#wg-ml` channel for the discussions about machine learning and the `#dna` and `##dailies-notes-assistant-tech` channels for the discussions about Dailies Notes Assistant.
* Weekly Technical Steering Committee (TSC) Zoom meetings are currently every other Monday at 13:00 PT (requests to change the day or time will be entertained if it's impeding participation of stakeholders).
* Public discussion also happens on [GitHub Issues](https://github.com/AcademySoftwareFoundation/dna/issues), [GitHub Discussions](https://github.com/AcademySoftwareFoundation/dna/discussions), and [GitHub Pull Requests](https://github.com/AcademySoftwareFoundation/dna/pulls).

Reporting bugs and security issues
----------------------------------

* **Defects and feature requests:** open a GitHub issue at
  <https://github.com/AcademySoftwareFoundation/dna/issues>. Include
  steps to reproduce, expected vs actual behavior, and the version or
  commit you are using.
* **Security vulnerabilities:** do **not** file a public issue. Follow
  [SECURITY.md](SECURITY.md) and report privately via GitHub security
  advisories or <dna-tsc-private@lists.aswf.io>.


Contributor License Agreement (CLA) and Intellectual Property
-------------------------------------------------------------

### Contributor License Agreements
To contribute to DNA, you must sign a Contributor License Agreement through the [EasyCLA](https://easycla.lfx.linuxfoundation.org) system, which is integrated with GitHub as a pull request check.

Prior to submitting a pull request, you can sign the form through EasyCLA. If you submit a pull request before the form is signed, the EasyCLA check will fail with a red NOT COVERED message, and you'll have another opportunity to sign the form through the provided link.

If you are an individual writing the code on your own time and you're sure you are the sole owner of any intellectual property you contribute, you can sign the CLA as an Individual Contributor.

If you are writing the code as part of your job, or if your employer retains ownership to intellectual property you create, then your company's legal affairs representatives should sign a Corporate Contributor License Agreement. If your company already has a signed CCLA on file, ask your local CLA manager to add you to your company's approved list.

The DNA CLAs are the standard forms used by Linux Foundation projects and recommended by the ASWF TAC.

### DCO contribution sign off

This project requires the use of the [Developer’s Certificate of Origin 1.1
(DCO)](https://developercertificate.org/), which is the same mechanism that
the [Linux®
Kernel](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/Documentation/process/submitting-patches.rst#n416)
and many other communities use to manage code contributions. The DCO is
considered one of the simplest tools for sign offs from contributors as the
representations are meant to be easy to read and indicating signoff is done as
a part of the commit message.

Here is an example Signed-off-by line, which indicates that the submitter
accepts the DCO:

    Signed-off-by: John Doe <john.doe@example.com>

You can include this automatically when you commit a change to your local git
repository using `git commit -s`. You might also want to leverage this
[command line tool](https://github.com/coderanger/dco) for automatically
adding the signoff message on commits.


### License notices

Please make sure that any code files added to the repo bear our
standard copyright notice and SPDX code at the top of the file, such as:

```
// SPDX-License-Identifier: Apache-2.0
// Copyright Contributors to the Dailies Notes Assistant Project.
```

For pure text files / documentation (that is not "code"), the license
identifier should instead be `CC-BY-4.0`.


Pull Requests and Code Review
-----------------------------

The way to submit changes or additions to this repo is via GitHub Pull Request.
GitHub has a [Pull Request Howto](https://help.github.com/articles/using-pull-requests/).

The protocol is like this:

1. Get a GitHub account, make your own fork of AcademySoftwareFoundation/dna
to create your own repository on GitHub, and then clone it to get a repository
on your local machine.

1. Edit, compile, and test your changes locally.

2. Push your changes to your fork (each unrelated pull request to a separate
"topic branch", please).

1. Make a "pull request" on GitHub for your patch.

2. The reviewers will look over the code and critique on the "comments" area.
Reviewers may ask for changes, explain problems they found, congratulate the
author on a clever solution, etc. But until somebody says "LGTM" (looks good
to me), the code should not be committed. Sometimes this takes a few rounds
of give and take. Please don't take it hard if your first try is not
accepted. It happens to all of us.

1. After approval, one of the senior developers (with commit approval to the
official main repository) will merge your fixes into the main branch.

Do not commit secrets, credentials, API keys, or unencrypted sensitive data.
Use the example environment files (for example `*.env.example`) and keep real
values in untracked local files or a secrets manager.


Coding standards and tests
--------------------------

* Python is formatted with Black and isort. From `backend/`, run `make format-python`.
* TypeScript/React is formatted with Prettier. From `frontend/`, run `npm run format`.
* New or changed functionality should include automated tests.
* Backend tests must keep coverage at or above 90%. From `backend/`, run `make test`.
* Frontend tests: from `frontend/`, run `npm run test-ci`.
* Pull requests that touch `backend/` or `frontend/` run the corresponding
  GitHub Actions checks; those checks should pass before merge.


Layout of experimental files
----------------------------

Production code lives in `backend/`, `frontend/`, and `dna-chrome-extension/`.
Experimental prototypes may be shared under `experimental/`, with a further
subdirectory specific to each organization. Experimental code is not a
supported release surface.

