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

canonical_journeys:
  - name: "existing_token_claim"
    goal: "Verify an existing identity can claim and save an invite through the real UI."
  - name: "new_visitor_invite_claim"
    goal: "Verify a first-time visitor can create and persist identity from an invite."
  - name: "multi_user_lineage_smoke"
    goal: "Verify a three-identity A -> B -> C lineage plus post, comment, and reaction evidence."

testing_boundary:
  - "Do not modify Chirpper merely to make a SUN test pass."
  - "If a SUN run exposes a Chirpper blocker, record it in artifacts first and treat any Chirpper change as a separate improvement task."
