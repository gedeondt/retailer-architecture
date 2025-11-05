# Instrucciones de implementación

## Alcance
Estas directrices aplican a todo el repositorio salvo que una carpeta anide un `AGENTS.md` más específico.

## Estándares generales
- Todo el código se escribirá para Node.js 22 y debe respetar las buenas prácticas de modularidad y principios SOLID.
- Los ficheros de código deben mantenerse ligeros; si una pieza crece demasiado, debe dividirse en módulos cohesionados.
- Cada fichero de código productivo debe contar con un fichero de pruebas asociado con tests unitarios ligeros que validen sus objetos o métodos principales.
- Las dependencias se gestionan exclusivamente con **npm**.
- Antes de subir cambios, asegúrate de que los servicios se inician en un estado limpio en cada ejecución (sin estado persistido de ejecuciones anteriores).
- Reutiliza funcionalidad común colocándola bajo la carpeta `lib/`.
- Al introducir nuevos servicios o frontales, ubícalos dentro de la carpeta de dominio correspondiente bajo `servicios/` o `frontales/` según corresponda.
- Las piezas de arquitectura compartida del sistema (por ejemplo, BBDD, colas, buses de eventos) deben vivir en la carpeta raíz `sistemas/`.
- Proporciona o actualiza los scripts de lanzadores en Node.js que permitan iniciar todos los servicios/frontales y ejecutar todos los tests desde la raíz.
- Si añades dependencias nuevas, actualiza el script raíz que orquesta los `npm install` para todos los paquetes.

