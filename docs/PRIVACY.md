# Privacidad

El corpus canonico se consulta mediante el adapter configurado y `LOCKED` es la politica de Internet por defecto. En ese modo no se envia la consulta a servicios web externos; NotebookLM sigue siendo la dependencia necesaria para investigar el notebook.

Las politicas externas son opt-in. La consulta se minimiza y puede rechazarse si contiene referencias a fuentes privadas, notebooks, datos internos o texto largo. Los resultados externos permanecen separados como `CANDIDATE_EXTERNAL` y `UNVERIFIED`.

El registro local contiene metadatos, fingerprints y capsulas truncadas. Revise o elimine `.data` segun la politica de su organizacion. Nunca se incluyen cookies, perfiles Chrome, secretos, rutas personales ni contenido privado en la certificacion publica o en el MCPB.
