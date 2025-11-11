export interface ScenarioJsonPromptInput {
  readonly scenarioDescription: string;
  readonly domainContext?: string;
  readonly actorCatalog?: string;
  readonly eventCatalog: string;
  readonly actionCatalog: string;
  readonly previousScenarioJson?: string;
  readonly extraInstructions?: string;
  readonly [key: string]: unknown;
}

export interface ScenarioJsonRetryPromptInput extends ScenarioJsonPromptInput {
  readonly inspection: {
    readonly errors: string[];
    readonly warnings?: string[];
    readonly [key: string]: unknown;
  };
}

export const scenarioDslRules = `
# Reglas del DSL de escenarios

## Formato general
- Todas las respuestas deben ser JSON válido sin comentarios.
- Utiliza únicamente las claves y estructuras indicadas en el contrato del escenario.
- Los identificadores deben escribirse en *camelCase*.

## Acciones
- Cada acción debe indicar el tipo de evento, el alias del evento de entrada y los datos necesarios para producir el evento de salida.
- Los alias declarados en "from" deben existir en la sección "listen".
- No inventes eventos; usa solo los que aparezcan en el catálogo provisto.

## Reglas de mapping
- Cuando definas "mapping" para un evento destino:
  - Revisa el "payloadSchema" del evento destino.
  - Para cada campo del destino:
    - Si el tipo es "string", "number" o "boolean":
      - Usa SOLO:
        - "campoDestino": "campoOrigen"
        - o "campoDestino": { "from": "campoOrigen" }
        - o "campoDestino": { "const": <valor escalar compatible> }
      - No uses "arrayFrom", "map", ni objetos complejos.
    - Si el tipo es "string[]", "number[]" o "boolean[]":
      - Trátalo también como un valor escalar-colección.
      - Usa SOLO:
        - "campoDestino": "campoOrigen" si el origen es también un array del mismo tipo,
        - o "campoDestino": { "from": "campoOrigen" },
        - o "campoDestino": { "const": [ <valores del tipo correcto> ] }.
      - Está PROHIBIDO usar "arrayFrom" + "map" para estos campos.
    - Solo si el "payloadSchema" destino define un ARRAY DE OBJETOS (ejemplo: "items": [ { "sku": "string" } ]):
      - puedes usar:
        - "items": { "arrayFrom": "itemsOrigen", "map": { "sku": "sku", ... } }
      - "arrayFrom" debe apuntar a un campo array de objetos en el evento origen.
      - Dentro de "map", solo referencias a campos del item origen o { "const": ... }.
- Regla dura:
  - El tipo construido por "mapping" debe coincidir EXACTAMENTE con el tipo de "payloadSchema" destino.
  - Si no tienes un origen razonable, usa { "const": ... } con el tipo correcto.
  - No referencies campos que no existan en el evento de entrada.
`;

const joinSections = (sections: Array<string | undefined>): string =>
  sections.filter((section): section is string => Boolean(section?.trim())).join("\n\n");

const formatErrors = (errors: string[]): string =>
  errors.length > 0 ? errors.map((error) => `- ${error}`).join("\n") : "- (sin detalles)";

export const scenarioJsonPrompt = ({
  scenarioDescription,
  domainContext,
  actorCatalog,
  eventCatalog,
  actionCatalog,
  previousScenarioJson,
  extraInstructions,
}: ScenarioJsonPromptInput): string =>
  joinSections([
    "Eres un generador experto de escenarios asíncronos para arquitecturas orientadas a eventos.",
    "Sigue el contrato provisto y responde exclusivamente con JSON válido.",
    scenarioDslRules,
    "Cuando generes 'mapping' en acciones 'emit', asegúrate de seguir estrictamente las reglas anteriores:\n- Para campos 'string[]'/'number[]'/'boolean[]' SOLO mapeos escalares o const (sin arrayFrom/map).\n- Usa 'arrayFrom' + 'map' ÚNICAMENTE para arrays de objetos definidos como [ { ... } ] en el payloadSchema destino.",
    domainContext ? `Contexto del dominio:\n${domainContext}` : undefined,
    actorCatalog ? `Actores y sistemas disponibles:\n${actorCatalog}` : undefined,
    `Catálogo de eventos disponibles:\n${eventCatalog}`,
    `Catálogo de acciones permitidas:\n${actionCatalog}`,
    scenarioDescription ? `Descripción del escenario a construir:\n${scenarioDescription}` : undefined,
    previousScenarioJson
      ? `Escenario generado previamente (referencia, no lo copies literalmente):\n${previousScenarioJson}`
      : undefined,
    extraInstructions,
    "Devuelve únicamente el JSON final del escenario, sin texto adicional ni explicaciones.",
  ]);

export const scenarioJsonRetryPrompt = (
  input: ScenarioJsonRetryPromptInput,
): string =>
  joinSections([
    scenarioJsonPrompt(input),
    "Se detectaron errores al validar tu respuesta anterior. Revísalos y corrige el JSON respetando las reglas del DSL.",
    `Errores de validación:\n${formatErrors(input.inspection.errors)}`,
    "Corrige los mappings para que los campos con tipo 'string[]'/'number[]'/'boolean[]' usen solo referencias directas o 'const', sin 'arrayFrom' ni 'map' de objetos.",
    input.inspection.warnings?.length
      ? `Advertencias adicionales:\n${formatErrors(input.inspection.warnings)}`
      : undefined,
  ]);
