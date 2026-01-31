# Clean up vs head

Checking the head of the branch and comparing it to the remote head, look to see if anything of the following is present and clean it up.

- Dead code paths
- Unused variables and refs
- Unnecessary code that is no longer in use or invoked
- Unnecessary dependencies in useEffect, useMemo, useCallback, etc.