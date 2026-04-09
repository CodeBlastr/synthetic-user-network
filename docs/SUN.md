product_direction:
  primary: "dockerized_prompt_driven_recommendation_tool"
  host: "http://localhost:3020"
  output: "one_recommendation_with_reasoning_screenshots_and_codex_markdown"

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
  - name: "prompt_to_review_recommendation"
    goal: "Capture one approved browser-evaluation run and publish a review page with a single recommendation."

secondary_journeys:
  - name: "existing_token_claim"
    goal: "Legacy Chirpper smoke path for an existing identity claiming and saving an invite through the real UI."
  - name: "new_visitor_invite_claim"
    goal: "Legacy Chirpper smoke path for a first-time visitor creating and persisting identity from an invite."
  - name: "multi_user_lineage_smoke"
    goal: "Legacy Chirpper smoke path for a three-identity A -> B -> C lineage plus post, comment, and reaction evidence."

testing_boundary:
  - "The SUN MVP is recommendation-first; it should stop after collecting enough evidence for one concrete next-step recommendation."
  - "Provider-side planning and analysis failures should surface actionable detail to the operator, especially for quota exhaustion versus temporary throttling."
  - "Do not modify Chirpper merely to make a SUN test pass."
  - "If a SUN run exposes a Chirpper blocker, record it in artifacts first and treat any Chirpper change as a separate improvement task."
