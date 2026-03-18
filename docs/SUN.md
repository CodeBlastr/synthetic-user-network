personas:
  - name: "High Quality Builder"
    behavior:
      post_frequency: medium
      comment_quality: high
      invites_sent: low
      abuse_probability: 0

  - name: "Casual User"
    behavior:
      post_frequency: low
      comment_quality: medium
      invites_sent: medium
      abuse_probability: 0.05

  - name: "Bad Actor"
    behavior:
      post_frequency: high
      comment_quality: low
      invites_sent: high
      abuse_probability: 0.4