# Descubrimiento dinámico

Startup sync, TTL incremental y refresh obligatorio ante cache miss cubren notebooks nuevos, renombrados y eliminados. Las fuentes se reemplazan incrementalmente por notebook y el passport se recalcula a partir de metadatos. La prueba determinista está en `tests/core.test.js`; el gate live requiere un NotebookLM real.
