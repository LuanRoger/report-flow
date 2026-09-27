# Evaluation run artifacts

Each evaluation run is written under a unique `<run-id>/` directory. Stage artifacts are created with exclusive-write semantics and commands refuse to overwrite an existing artifact.

Raw datasets and run outputs are intentionally ignored by Git. Keep `README.md` and `.gitignore` tracked, and archive official run directories externally with their checksums after execution.
