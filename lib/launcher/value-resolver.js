'use strict';

function getNestedProperty(target, pathSegments) {
  if (!target) {
    return undefined;
  }

  let current = target;
  for (const segment of pathSegments) {
    if (current == null) {
      return undefined;
    }
    current = current[segment];
  }

  return current;
}

function resolveValueFromSource(source, context) {
  if (typeof source !== 'string' || source.length === 0) {
    return undefined;
  }

  const [prefix, ...rest] = source.split('.');

  switch (prefix) {
    case 'options':
      return getNestedProperty(context.options, rest);
    case 'runtime':
      return getNestedProperty(context.runtime, rest);
    case 'config':
      return getNestedProperty(context.config, rest);
    case 'defaults':
      return getNestedProperty(context.defaults, rest);
    case 'query':
      return getNestedProperty(context.query, rest);
    case 'domainConfig':
      return getNestedProperty(context.domainConfig, rest);
    case 'runtimeDomain':
      return getNestedProperty(context.runtimeDomain, rest);
    case 'systemConfig':
      return getNestedProperty(context.systemConfig, rest);
    default:
      return undefined;
  }
}

function resolveFirstValue(sources, context) {
  if (!Array.isArray(sources)) {
    return undefined;
  }

  for (const source of sources) {
    const value = resolveValueFromSource(source, context);
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return undefined;
}

module.exports = {
  getNestedProperty,
  resolveValueFromSource,
  resolveFirstValue,
};
