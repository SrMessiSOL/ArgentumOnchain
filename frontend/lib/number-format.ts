const formatters = {en:new Intl.NumberFormat('en-US'), es:new Intl.NumberFormat('es-AR')};
export function formatNumber(value:number|bigint, locale:'en'|'es'='en'):string { return formatters[locale].format(value); }
