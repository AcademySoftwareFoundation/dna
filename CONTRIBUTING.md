<!-- SPDX-License-Identifier: CC-BY-4.0 -->
<!-- Copyright Contributors to the Dailies Notes Assistant Project. -->


Contributing to the DNA Project
===============================

This whole file is mostly a placeholder, we will flesh it out over time.
I've seeded some parts with language borrowed from the CONTRIBUTING of other
ASWF projects. The DNA TSC, when fully formed, can revise this all as needed.


Communications
--------------

* [ASWF Slack](https://slack.aswf.io) -- join for the `#wg-ml` channel for the discussions about this project.
* Weekly Technical Steering Committee (TSC) Zoom meetings are currently Mondays at 12:00 PT (requests to change the day or time will be entertained if it's impeding participation of stakeholders).


Contributor License Agreement (CLA) and Intellectual Property
-------------------------------------------------------------

We don't yet have a CLA in place. TBD.

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


Layout of experimental files
----------------------------

We don't have "real code" yet, but we're starting to use the repo as a staging
area for experimentation and information sharing among the contributors.

We recommend that experimental code be shared underneath the `experimental`
subdirectory, with a further subdirectory specific to each organization.

