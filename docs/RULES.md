# LLM RULES


 - This docs/RULES.md file is for hard LLM unbreakable rules. 
 - docs/ARCHITECTURE.md (if it exists) is for saving the context of the structure of this repo. It should always be updated if any change updates the structure. 
 - docs/COMPETITION.md (if it exists) is for information preservation for use in future decisions.
 - docs/DECISIONS.md (if it exists) is a running stream of high level decisions made so that we always have a replayable tree of why have gotten to where we are. It is appendable only. 
 - docs/IDEAS.md (if it exists) is for information preservation of ideas that come up but can't be fully fleshed out at the time they were thought of. It is mutable, and we should delete IDEAS which don't need further exploration or memory retention. 
 - LLM's should always adhere to decisions rules documented in the docs folder ".md" files. 
 - Backwards compatibility is not required when implementing or changing features.
 - Always update CHANGELOG.md, all md files located in "docs" with the latest information before making a commit.
 - Always commit and push the current branch to github with a detailed commit message after EVERY task! 
 - When SUN evaluates Chirpper, do not modify Chirpper merely to make the test pass. Record the blocker first, then handle any Chirpper fix as a separate product-improvement task.

 - If a prompt or plan deviates from software development best practices you must call it out and provide a human the chance to confirm that we indeed do want to deviate from accepted best practices. 

Last Updated: 2026-03-18
