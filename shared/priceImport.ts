import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";
import { parsePrivateSmmImport, type SmmImportRow } from "./privateSmm";

export const IMPORT_FIELDS = ["series_id","metal_id","specification","purity","delivery_form","region","price_type","assessed_at","date_precision","currency","unit","tax_status","vat_rate","minimum","maximum","mean","source_url"] as const;
export type ImportField = typeof IMPORT_FIELDS[number];
export const FIELD_LABELS: Record<ImportField,string> = {series_id:"ID ценового ряда",metal_id:"Металл",specification:"Спецификация",purity:"Чистота",delivery_form:"Форма поставки",region:"Регион",price_type:"Тип цены",assessed_at:"Дата оценки",date_precision:"Точность даты",currency:"Валюта",unit:"Единица",tax_status:"НДС",vat_rate:"Подтверждённая ставка НДС (доля)",minimum:"Минимум",maximum:"Максимум",mean:"Опубликованная средняя / одиночная цена",source_url:"Ссылка SMM"};
export interface ImportTable { name:string; headers:string[]; rows:string[][] }
const list=(v:unknown):Record<string,unknown>[]=>Array.isArray(v)?v:v&&typeof v==="object"?[v as Record<string,unknown>]:[];
function finish(name:string,matrix:string[][]):ImportTable {
  const nonempty=matrix.filter(r=>r.some(v=>v.trim()));
  if(nonempty.length<2 || nonempty.length>501 || nonempty.some(r=>r.length>40 || r.some(c=>c.length>2000)))throw Error("Нужны заголовок и 1–500 строк, до 40 столбцов и 2000 символов в ячейке.");
  const headers=nonempty[0].map(v=>v.trim());
  if(headers.some(h=>!h)||new Set(headers).size!==headers.length)throw Error("Заголовки должны быть непустыми и уникальными.");
  if(nonempty.slice(1).some(r=>r.length>headers.length))throw Error("В строке больше значений, чем заголовков.");
  return {name,headers,rows:nonempty.slice(1).map(r=>headers.map((_,i)=>r[i]??""))};
}
export function parseCsv(input:string,delimiter?:string):ImportTable {
  if(input.length>1000000 || input.includes("\0"))throw Error("CSV слишком большой или содержит недопустимые символы.");
  const text=input.replace(/^\uFEFF/,"");
  const read=(sep:string)=>{
    const rows:string[][]=[];let row:string[]=[],cell="",quoted=false,closed=false;
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;}
      else if(c==='"'){if(cell || closed)throw Error("Некорректные кавычки CSV.");quoted=true;}
      else if(c===sep){row.push(cell);cell="";closed=false;}
      else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell="";closed=false;}
      else {if(closed && c.trim())throw Error("Символы после закрывающей кавычки CSV.");if(!closed)cell+=c;}
      if(rows.length>502 || row.length>40 || cell.length>2000)throw Error("Превышены ограничения таблицы.");
    }
    if(quoted)throw Error("Незакрытые кавычки CSV.");
    if(cell||row.length||closed){row.push(cell);rows.push(row);}return rows;
  };
  if(delimiter)return finish("CSV",read(delimiter));
  const candidates=[";",",","\t"].flatMap(sep=>{try{const rows=read(sep);return [{rows,width:rows[0]?.length??0}];}catch{return [];}}).sort((a,b)=>b.width-a.width);
  if(!candidates.length)throw Error("Не удалось разобрать CSV.");
  return finish("CSV",candidates[0].rows);
}
function parseXml(bytes:Uint8Array){const s=strFromU8(bytes);if(/<!DOCTYPE|<!ENTITY/i.test(s))throw Error("Внешние XML-сущности запрещены.");return new XMLParser({ignoreAttributes:false,parseTagValue:false,removeNSPrefix:true,processEntities:false}).parse(s);}
function text(v:unknown):string {if(typeof v==="string"||typeof v==="number")return String(v);if(v&&typeof v==="object"){const r=v as Record<string,unknown>;return text(r.t??r["#text"])||list(r.r).map(x=>text(x.t)).join("");}return "";}
function excelDay(n:number,date1904=false){if(!Number.isFinite(n)||n<1||(!date1904&&Math.floor(n)===60))throw Error("Некорректная дата Excel.");return new Date((date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,30))+Math.floor(n)*86400000+(!date1904&&n<60?86400000:0)).toISOString().slice(0,10);}
export function parseXlsx(bytes:Uint8Array):ImportTable[]{
  if(bytes.length>2000000 || bytes[0]!==80 || bytes[1]!==75)throw Error("Нужен файл Excel .xlsx до 2 МБ; .xls нужно пересохранить в .xlsx.");
  let size=0,count=0;
  const entries=unzipSync(bytes,{filter:f=>{
    if(!/^xl\/(?:workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|worksheets\/sheet\d+\.xml)$/.test(f.name))return false;
    size+=f.originalSize;count++;if(f.originalSize>2500000||size>8000000||count>30)throw Error("Распакованная книга слишком большая.");return true;
  }});
  if(!entries['xl/workbook.xml']||!entries['xl/_rels/workbook.xml.rels'])throw Error("Повреждённая книга Excel.");
  const wb=parseXml(entries['xl/workbook.xml']),rels=list(parseXml(entries['xl/_rels/workbook.xml.rels']).Relationships?.Relationship);
  const strings=entries['xl/sharedStrings.xml']?list(parseXml(entries['xl/sharedStrings.xml']).sst?.si).map(text):[];
  const styles=entries['xl/styles.xml']?parseXml(entries['xl/styles.xml']).styleSheet:{};
  const formats=new Map(list(styles.numFmts?.numFmt).map(f=>[String(f['@_numFmtId']),String(f['@_formatCode'])]));
  const dateStyles=list(styles.cellXfs?.xf).map(f=>{const id=Number(f['@_numFmtId']);return(id>=14&&id<=22)||/[yd]/i.test((formats.get(String(id))??"").replace(/"[^"]*"|\[[^\]]*\]/g,""));});
  const date1904=["1","true"].includes(String(wb.workbook?.workbookPr?.['@_date1904']));
  return list(wb.workbook?.sheets?.sheet).map(sheet=>{
    const rel=rels.find(r=>r['@_Id']===sheet['@_id']);if(!rel||rel['@_TargetMode']==='External')throw Error("Внешние листы не поддерживаются.");
    const path=String(rel['@_Target']).replace(/^\//,"").replace(/^xl\//,"");if(!/^worksheets\/sheet\d+\.xml$/.test(path)||!entries['xl/'+path])throw Error("Некорректная ссылка листа.");
    const rows=list(parseXml(entries['xl/'+path]).worksheet?.sheetData?.row);if(rows.length>501)throw Error("На листе больше 500 наблюдений.");
    const matrix=rows.map(r=>{const values:string[]=[];for(const c of list(r.c)){
      if(c.f!==undefined)throw Error("Формулы Excel не импортируются. Сохраните значения вместо формул.");
      const ref=String(c['@_r']);const match=/^([A-Z]{1,2})\d+$/.exec(ref);if(!match)throw Error("Некорректный адрес ячейки.");
      const col=[...match[1]].reduce((v,x)=>v*26+x.charCodeAt(0)-64,0)-1;if(col>=40)throw Error("В книге больше 40 столбцов.");
      let value=c['@_t']==='s'?strings[Number(c.v)]:c['@_t']==='inlineStr'?text(c.is):text(c.v);
      if(c['@_t']==='e')throw Error("В Excel есть ячейка с ошибкой.");
      if(!c['@_t']&&value&&dateStyles[Number(c['@_s'])])value=excelDay(Number(value),date1904);
      values[col]=value??"";
    }return Array.from({length:values.length},(_,i)=>values[i]??"");});
    return finish(String(sheet['@_name']),matrix);
  });
}
const aliases:Record<string,string>={w:"tungsten",mo:"molybdenum",femo:"ferromolybdenum",few:"ferrotungsten",sn:"tin",zn:"zinc",cu:"copper",al:"aluminum",cr:"chromium",co:"cobalt",zr:"zirconium",nb:"niobium",ta:"tantalum",вольфрам:"tungsten",молибден:"molybdenum",ферромолибден:"ferromolybdenum",ферровольфрам:"ferrotungsten",олово:"tin",цинк:"zinc",медь:"copper",алюминий:"aluminum",хром:"chromium",кобальт:"cobalt",цирконий:"zirconium",ниобий:"niobium",тантал:"tantalum"};
export type ColumnMapping=Partial<Record<ImportField,number>>;
export type ImportDefaults=Partial<Record<ImportField,string>>;
export function mapPriceTable(table:ImportTable,mapping:ColumnMapping,defaults:ImportDefaults,decimal:"dot"|"comma"="dot"):{rows:SmmImportRow[];errors:string[]}{
 const output:SmmImportRow[]=[],errors:string[]=[];
 for(const [i,cells]of table.rows.entries())try{
  const value=(field:ImportField)=>{const col=mapping[field];return(col===undefined?defaults[field]??"":cells[col]??"").trim();};
  const r=Object.fromEntries(IMPORT_FIELDS.map(k=>[k,value(k)])) as Record<string,unknown>;
  for(const k of ['minimum','maximum','mean','vat_rate'] as const){const raw=value(k).replace(/[\s\u00a0\u202f]/g,"");const normalized=decimal==='comma'?raw.replace(',','.'):raw;if(raw && !/^\d+(?:\.\d+)?$/.test(normalized))throw Error(`«${FIELD_LABELS[k]}»: укажите число в выбранном формате, без валюты и разделителей тысяч.`);r[k]=raw?Number(normalized):null;}
  const metal=value('metal_id').toLowerCase();r.metal_id=aliases[metal]??metal;
  const unit=value('unit').toLowerCase();r.unit=({"кг":"kg","т":"ton","t":"ton","mt":"ton","фунт":"lb"} as Record<string,string>)[unit]??unit;
  r.currency=value('currency').toUpperCase();
  const tax=value('tax_status').toLowerCase();r.tax_status=({"без ндс":"excluded","с ндс":"included","ндс не указан":"unknown"} as Record<string,string>)[tax]??tax;
  const date=value('assessed_at');if(/^\d{2}\.\d{2}\.\d{4}$/.test(date))r.assessed_at=date.slice(6)+'-'+date.slice(3,5)+'-'+date.slice(0,2);
  const day=String(r.assessed_at).slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||new Date(day).toISOString().slice(0,10)!==day)throw Error("Некорректная календарная дата.");
  output.push(...parsePrivateSmmImport([r]));
 }catch(e){errors.push(`Строка ${i+2}: ${e instanceof Error?e.message:'ошибка данных'}`);}
 if(!errors.length)try{parsePrivateSmmImport(output);}catch(e){errors.push(e instanceof Error?e.message:'Повторные наблюдения.');}
 return {rows:output,errors};
}
