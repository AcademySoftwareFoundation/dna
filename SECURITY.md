# Security Policy

This file describes the project security policy.

For purposes of this policy, a "vulnerability" is any bug that causes
a crash or undefined behavior in the library, whether it is evidently
exploitable or not. These include out-of-bounds memory access, buffer
overflows, use-after-free, as well as out-of-memory faults, which in
certain situations can lead to a Denial-of-Service attack.

If you discover a crash in a publicly released version of the project,
you may choose to simply fix it and release a new version, mentioning
the fix in the release notes. This is sufficient if there is no
indication that the bug is publicly known or widely recognized.

Software that is widely used, either on its own or as a component of
other widely used applications, must take vulnerabilities seriously,
especially if the software implements an input file format.

## Reporting Vulnerabilities

Each project should establish an email address for reporting
vulnerabilities confidentially, something like
security@_project_.org. For obvious reasons, some vulnerabilities
should not be reported publicly via GitHub Issues.  The email should
forward to the project's Technical Steering Committee or a small group
of trusted maintainers.

A typical security policy is to respond to vulernability reports
within 14 days. 

## Common Vulnerabilities and Exposures (CVE)

If a bug becomes publicly known, or there is any public perception
that it may represent an exploitable security vector, it may warrant a
["Common Vulnerability and
Exposure"](https://en.wikipedia.org/wiki/Common_Vulnerabilities_and_Exposures)
(CVE) identifier. CVE ID's are global, publicly listed names that aid
in tracking and addressing a software vulnerability. CVE ID's allow
the users of software to know the state of software they are using.

### Requesting CVE ID's

CVE ID's are generated, assigned, and cataloged by a "CVE Numbering
Authority" (CNA). Many familiar companies and organizations act as
CNA's, including Apple, Autodesk, GitHub, Google, etc. The MITRE
Corporation acts as a "CNA of Last Resort", for vulnerabilities in
software projects not associated with any other numbering
authority. The Academy Software Foundation may someday consider
becoming its own CNA, but for now, it is perfectly acceptable for ASWF
projects to use MITRE's CVE's.  MITRE's CVE ID's take the form of
"CVE-<year>-<number>".

Sometimes, security researchers will identify a vulnerability, report
it to the project, and request that the project generate a CVE ID for
tracking and record keeping. In this case, once the vulnerability has
been addressed, maintainers of the project can request a CVE ID
via MITRE's [CVE request form](https://cveform.mitre.org/).  This is a
simple process that requires basic information about the affected
software and the relevant software versions. This form can include
references to GitHub Issues or PR's or release notes that discuss the
issue. This information should clearly identify the versions of the
project that exhibit the bug and the versions in which it is resolved.

Occasionally, a security researcher will identify a vulnerability and
request a CVE ID for it themselves. This makes the vulnerability
public, in which case the project should respond promptly to prepare a
new release that addresses the issue. This may happen in the case where
it is not obvious to users how to report the issue to the project from
the outset, hence the need to publicize a reporting policy. Because
CVE's are public, a CVE without a corresponding software patch demands
immediate attention.

CVE ID are permanent. They cannot be deleted once created. For this
reason, it is best to understand an issue thoroughly before requesting
a CVE ID.  If the understanding of an issue evolved after it is
created, the entry can be updated with additional information.

### CVE ID Descriptions

The description of a CVE should provide enough details to distinguish
it from other vulnerabilies. The description should identify the
nature of the vulnerability, the software component and/or product
together with the affected version(s), together with an indication of the
implications of the vulnerability. See the CVE Project's documentation
on [key details
phrasing](http://cveproject.github.io/docs/content/key-details-phrasing.pdf)
for further naming guidelines.

Example CVE ID's and descriptions:

* CVE-2020-9633 Adobe Flash Player Desktop Runtime 32.0.0.371 and
  earlier, Adobe Flash Player for Google Chrome 32.0.0.371 and
  earlier, and Adobe Flash Player for Microsoft Edge and Internet
  Explorer 32.0.0.330 and earlier have an use after free
  vulnerability. Successful exploitation could lead to arbitrary code
  execution.

* CVE-2020-14153 In IJG JPEG (aka libjpeg) before 9d, jdhuff.c has an
  out-of-bounds array read for certain table pointers.

* CVE-2017-9116 In OpenEXR 2.2.0, an invalid read of size 1 in the
  uncompress function in ImfZip.cpp could cause the application to
  crash.

### Documenting Known Vulnerabilities

This document should reference known vulnerabilities in all past
versions of the project. For each vulnerability, it should identify
which versions of the project the vulnerability exists in.

For example, an entry from OpenEXR:

* [CVE-2020-15306](https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2020-15306) 2.0.0, 2.0.1, 2.1.0, 2.2.0, 2.2.1, 2.3.0, 2.4.0, 2.4.1, 2.5.0, 2.5.1 

Project release notes should also identify any CVE's that are resolved
by that release.

## Out-of-Memory Errors

A secure and robust library API should safeguard against memory
allocation faults, or attempts to allocate more than the available
memory. If triggerable via an input data file, such a fault can be
used in a Denial-of-Service attack. Ideally, allocation attempts are
reported as errors before they lead to actual crashes.

## Fuzz Testing

Any ASWF project that implements a file format should include a suite
of "fuzz" tests that validate proper handling of invalid input
data. Bugs in the handling of input data can represent an exploitable
vulnerability in software by offering an attacker the opportunity to
execute malicious code through specially crafted "invalid" input. Fuzz
tests repeatedly attempt to load deliberately corrupted data,
typically executed with "sanitizer" compiler options that cause
invalid or undefined behavior to be reported as errors.

The typical way to execute a sanitizer is via the
``-fsanitize=undefined,address`` argument to ``gcc`` or ``clang``.

Sanitizers often report behavior that does not necessarily represent
an exploitable vector for an attacker, such as integer overflow or
invalid enum values, which depending on the circumstances might be
regarded more as annoyances that true vulnerabilies. However, when a
library that implements a file format is used in the handling of data
from potentially unknown sources, there is comfort in knowing that the
library is resilient to all forms of input. Even moreso than with
compiler warnings, a professional-grade file format library should
certify that all forms of input are properly processed.

### OSS-Fuzz

The Google [OSS-Fuzz](https://google.github.io/oss-fuzz) project is a
continuous fuzzing service that is free to open source software
services. Google servers repeatedly generate input data and feed it to
a project's fuzz test suite, reporting and cataloging resulting
errors.  OSS-Fuzz is easy to use; error reports include the reproducer
test case data, and fixes to the library are detected automatically,
with cases marked as closed as soon as a fix is integrated.

OSS-Fuzz catalogs issues privately to project maintainers, so that
bugs can be fixed before public announcement. OSS-Fuzz makes the
reports public 30 days after discovery, meaning that project
maintainers have 30 days to fix a bug before its report is publicly
available via the OSS-Fuzz bug database.

A project integrating with OSS-Fuzz should expect to get a steady
stream of minor, pedantic issues, which should presumably trail off
significantly over time.

## Release Tarball Signing

ASWF projects typically make software available for download via
GitHub's "Releases" page, through a link that downloads the source to
a .zip or .tar.gz "tarball" or by simply cloning the repo at a given
git tag. This is generally regarded as safe and secure by most users.

Some users may request an additional level of integrity guarantee,
especially Linux distributions who package and redistribute libraries
as a part of the operation system. You can sign GitHub releases using
GnuPG with [steps outlined by
Debian](https://wiki.debian.org/Creating%20signed%20GitHub%20releases). This
gives the user the ability to verify that the downloaded code is
exacty what the maintainers intended.
