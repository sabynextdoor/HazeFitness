name: Feature request
description: Suggest an idea or improvement
title: "[Feature]: "
labels: ["enhancement"]
body:
  - type: textarea
    id: problem
    attributes:
      label: What problem does this solve?
      description: Describe the need or pain point.
    validations:
      required: true
  - type: textarea
    id: proposal
    attributes:
      label: Proposed solution
    validations:
      required: true
  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives considered
