# Flashcards Study App

## Summary

Browser-based Flashcards Study App created with GitHub Copilot.

## Reflection

Where AI saved time.

- It allowed me to quicly generate code for multiple files including the HTML, CSS, and JavaScript.

At least one AI bug you identified and how you fixed it.

- The code successfully allowed me to crate new decks, but it did not successfully implement the new card feature. I could use the form to create new cards, but the cards were not generated and saved.

A code snippet you refactored for clarity.

```
<button id="prev-btn" class="btn" aria-label="Previous card">
```

One accessibility improvement you added.

- In my review of the HTML code, I didnt' see any spots where additional aria tags were needed, but I used AI to review the code specifically for aria tags and it added additional tags to the "Previous Card", "Flip Card", and "Next Card" buttons.

What prompt changes improved AI output.

- GitHub Copilot actually suggested additional prompts, so I used thos to improve the code. Those prompts are listed below.
  -- Improve modal focus trap and accessibility (Tab cycle inside modal).
  -- Add card list/editor and confirm delete for cards.
  -- Add import/export JSON and export button.
  -- Add spaced-repetition/stats if desired.
