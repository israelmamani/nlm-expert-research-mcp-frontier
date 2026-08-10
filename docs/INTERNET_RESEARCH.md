# Internet

La politica se transporta en la capsula (`LOCKED`, `AUTO`, `VERIFY`, `AUGMENT`, `ULTRA`) y `LOCKED` es el valor predeterminado. En `LOCKED` no se llama a DuckDuckGo ni a otro proveedor externo.

Cuando el usuario activa una politica externa, la consulta pasa por `sanitizeExternalQuery`. Peticiones que contienen referencias a notebooks, fuentes privadas, datos internos o texto largo se rechazan con `EXTERNAL_QUERY_REQUIRES_EXPLICIT_APPROVAL`. Los resultados web son siempre `CANDIDATE_EXTERNAL` y `UNVERIFIED`; nunca elevan la evidencia canonica.
