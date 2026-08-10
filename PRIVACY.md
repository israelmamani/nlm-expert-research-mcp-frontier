# Privacy

`LOCKED` is the real default. In that mode, research queries and notebook-derived text are sent only to NotebookLM through the authenticated Google session; no external web research is performed. Optional Internet policies require explicit selection, minimize the query, reject likely private notebook-derived prompts, and quarantine results as candidate external evidence.

Local storage contains the dedicated Chrome profile, notebook/source metadata, and bounded research sessions. It may therefore contain sensitive account state and excerpts. It is excluded from source control and packaging. Delete the configured data directory to remove local Frontier state, understanding that this also removes the saved Google session.

Google/NotebookLM remains a third-party processor subject to Google's terms and privacy policy. Frontier does not claim that NotebookLM is an offline or local service.
