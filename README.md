<!-- SPDX-License-Identifier: CC-BY-4.0 -->
<!-- Copyright Contributors to the Dailies Notes Assistant Project. -->
<!-- https://github.com/AcademySoftwareFoundation/dna -->

<img width="4801" height="2001" alt="ASWF_DNA Project Logo_Color_Dark_Without_BG" src="https://github.com/user-attachments/assets/db3d414b-367a-498c-b8aa-6b2b8495f35e" />


Introduction: Dailies Notes Assistant (DNA)
===========================================

DNA (Dailies Note Assistant) is an open initiative under the Academy Software Foundation to standardize how creative review notes are:

- Captured
- Structured
- Stored
- Shared across tools

It aims to explore how large-language-model-assisted transcription and summarization can meaningfully enhance the VFX dailies note-taking process, prioritizing practical utility and thoughtful support for production professionals. This is the first project proposed in the [ASWF Machine Learning Workgroup](https://github.com/AcademySoftwareFoundation/tac/issues/1029)

To get involved, see user stories, understand workflow and much more please visit the [WIKI](https://github.com/AcademySoftwareFoundation/dna/wiki/Get-Involved)

The goals of this project are detailed in the [original proposal](https://github.com/AcademySoftwareFoundation/tac/issues/1040)

## **Why DNA?**

Today, review notes are usually taken by a single coordinator who has to follow the entirety of a meeting perfectly as it jumps around with different feedback associated with different media and tasks.

This can lead to:

- Lost context and feedback between reviews
- No standard for note taking
- Inconsistent version tracking
- Limited interoperability
- Poor AI usability

With DNA, review workflows become:

- **Clear** - notes tied to exact frames, versions, and context
- **Continuous** - feedback carries forward across iterations
- **Connected** - works across review tools, trackers, and pipelines
- **AI-ready** - structured data enables summaries, actions, and insights

DNA seeks to be an open-source, integratable tool that improves accuracy and efficiency in capturing review feedback without removing essential coordinator responsibilities.
### **1\. A Standard Note Format**

A shared structure for:

- Who gave the note
- When it was given
- What frame/timecode it applies to
- Which version it belongs to
- Status (open, resolved, etc.)
- Relationships (replies, carry-forward)

### **2\. A Workflow Model**

Based on real production workflows:

- Live review Dailies sessions
- Multi-user collaboration
- Version iteration cycles
- Note carry-forward

### **3\. A Foundation for AI**

Because notes are structured, you can:

- Turn transcripts into usable notes
- Auto-generate summaries
- Extract actionable tasks
- Track feedback across versions

**Example Workflow:**

1\. Director gives notes during review

2\. Notes are captured (manually or via transcription)

3\. Notes are structured using DNA

4\. Notes attach to a version + timecode

5\. Teams track progress without re-copying anything

## **Who is DNA for?**

DNA is built for:

### **Production Teams**

- Directors
- Supervisors
- Coordinators

### **Technical Teams**

- Pipeline engineers
- TDs
- Tool developers

### **Workflow Owners**

- Studios designing heavy dailies review pipelines

## **Project Status**

- 🚧 Early-stage (actively shaping the standard)
- 🤝 Seeking industry feedback
- 🧪 Validating real-world workflows

## **How to get involved**

### Communications channels and additional resources

- **Give Feedback**
  - **Share Workflows**
  - **Highlight Painpoints**
  - **Validate or challenge assumptions**
  - **Ask a question:**
    - All can be done via [ASWF Slack](https://slack.aswf.io/) -- join for the #dna channel for the discussions about this project.
- **Attend a meeting:**
  - Technical Steering Committee meetings are open to the public, bi-weekley on Mondays 12:30pm PST
  - Calendar: [Zoom Meeting](https://zoom-lfx.platform.linuxfoundation.org/meeting/96088138284?password=c9e528a8-3852-4b82-89c2-96d6f22526ad)
  - Meeting Notes: [HERE](https://docs.google.com/document/d/1RebKyycUsWSKpv09PjAcWCFfMmXFiS4d43udIWC30lY/edit?tab=t.0)
- **Report a bug:**
  - Submit an Issue: [**https://github.com/AcademySoftwareFoundation/dna/issues**](https://github.com/AcademySoftwareFoundation/dna/issues)
- **Contribute a Fix, Feature, or Improvement:**
  - Read the [**Contribution Guidelines**](https://github.com/AcademySoftwareFoundation/dna/blob/main/CONTRIBUTING.md) and [**Code of Conduct**](https://github.com/AcademySoftwareFoundation/dna/blob/main/CODE_OF_CONDUCT.md)
  - Submit a Pull Request: [**https://github.com/AcademySoftwareFoundation/dna/pulls**](https://github.com/AcademySoftwareFoundation/dna/pulls)
- [GitHub project page](https://github.com/AcademySoftwareFoundation/dna)
- [The DNA project was established by this proposal](https://github.com/AcademySoftwareFoundation/tac/issues/1040)
- [ASWF's Machine Learning Working Group proposal](https://github.com/AcademySoftwareFoundation/tac/issues/1029) -- describes the purpose and scope of MLWG. Join the [ASWF Slack](https://slack.aswf.io/) -- join for the #wg-ml channel for the discussions about Machine Learning

## ☎️ Contributing and Developer Documentation

Documentation, including quick start, architecture, and API docs, are available on: [QUICKSTART.md](https://github.com/AcademySoftwareFoundation/dna/blob/main/QUICKSTART.md)

For information on how to contribute to DNA please visit: [CONTRIBUTING.md](https://github.com/AcademySoftwareFoundation/dna/blob/main/CONTRIBUTING.md)



🏢 Project administration and Licensing
---------------------------------------

The DNA project is part of the [Academy Software
Foundation](https://www.aswf.io/), a part of the Linux Foundation formed in
collaboration with the Academy of Motion Picture Arts and Sciences. The
[Technical Charter](aswf/Technical-Charter.md) and [Project
Governance](GOVERNANCE.md) explain how the project is run, who makes
decisions, etc. Please be aware of our [Code of Conduct](CODE_OF_CONDUCT.md).

This project is (c) Copyright Contributors to the Dailies Notes Assistant project.

For original code, we use the [Apache-2.0 license](LICENSE), and for
documentation, the [Creative Commons Attribution 4.0 Unported
License](http://creativecommons.org/licenses/by/4.0/).

