name: Bug report
description: Report something that isn't working as expected
title: "[Bug]: "
labels: ["bug"]
body:
  - type: markdown
    attributes:
      value: |
        Thanks for taking the time to file a bug report. Please fill in as much detail as you can.
  - type: textarea
    id: what-happened
    attributes:
      label: What happened?
      description: A clear description of the bug.
    validations:
      required: true
  - type: textarea
    id: steps
    attributes:
      label: Steps to reproduce
      placeholder: |
        1. Go to '...'
        2. Click on '...'
        3. See error
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: Expected behaviour
    validations:
      required: true
  - type: dropdown
    id: area
    attributes:
      label: Area
      options:
        - Authentication / login
        - Members & trainers
        - Fees & payments (Razorpay)
        - Attendance / QR
        - Classes & bookings
        - POS
        - Reports
        - Member portal
        - Other
    validations:
      required: true
  - type: input
    id: node
    attributes:
      label: Node.js version
      placeholder: e.g. 20.11.0
  - type: input
    id: os
    attributes:
      label: Operating system
      placeholder: e.g. Windows 11, macOS 14, Ubuntu 22.04
