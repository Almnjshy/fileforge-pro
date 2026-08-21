"use client";
import type { FloatingWindow, FloatingWindowType } from "./types";
import { clampWindowGeometry } from "./window-manager";

const STORAGE_KEY="fileforge-window-state-v3";
const LEGACY_KEYS=["fileforge-window-state-v2","fileforge-window-state-v1"];
const VALID_TYPES: readonly FloatingWindowType[]=["folder","text-editor","image-preview","video-preview","audio-preview","pdf-preview","archive-preview","web-preview","hex-preview","properties","search","storage-analyzer","apps","settings"];

type PersistedWindowState=Pick<FloatingWindow,"id"|"type"|"title"|"path"|"nodeId"|"x"|"y"|"width"|"height"|"zIndex"|"minimized"|"maximized"|"prevGeom">;

const numberOr=(v:unknown,d:number)=>{const n=Number(v);return Number.isFinite(n)?n:d};
function sanitize(raw:any):PersistedWindowState|null{
  if(!raw||typeof raw!=="object"||typeof raw.id!=="string"||typeof raw.title!=="string") return null;
  if(!(VALID_TYPES as readonly string[]).includes(String(raw.type))) return null;
  const state:PersistedWindowState={
    id:raw.id,type:raw.type,title:raw.title,path:typeof raw.path==="string"?raw.path:undefined,nodeId:typeof raw.nodeId==="string"?raw.nodeId:undefined,
    x:numberOr(raw.x,64),y:numberOr(raw.y,64),width:numberOr(raw.width,560),height:numberOr(raw.height,420),zIndex:Math.max(100,numberOr(raw.zIndex,100)),minimized:false,maximized:Boolean(raw.maximized),
    prevGeom:raw.prevGeom&&typeof raw.prevGeom==="object"?{x:numberOr(raw.prevGeom.x,64),y:numberOr(raw.prevGeom.y,64),width:numberOr(raw.prevGeom.width,560),height:numberOr(raw.prevGeom.height,420)}:undefined,
  };
  if(typeof window!=="undefined"&&!state.maximized) Object.assign(state,clampWindowGeometry(state,window.innerWidth,window.innerHeight));
  return state;
}
export function saveWindowState(windows:FloatingWindow[]):void{
  if(typeof window==="undefined")return;
  try{window.localStorage.setItem(STORAGE_KEY,JSON.stringify({version:3,savedAt:Date.now(),windows:windows.map(w=>({...w,minimized:false}))}));}catch{}
}
export function loadWindowState():PersistedWindowState[]{
  if(typeof window==="undefined")return[];
  try{
    let raw=window.localStorage.getItem(STORAGE_KEY);
    if(!raw)for(const k of LEGACY_KEYS){raw=window.localStorage.getItem(k);if(raw)break;}
    if(!raw)return[];
    const parsed=JSON.parse(raw);const items=Array.isArray(parsed)?parsed:parsed?.windows;if(!Array.isArray(items))return[];
    return items.map(sanitize).filter((x):x is PersistedWindowState=>!!x).sort((a,b)=>a.zIndex-b.zIndex);
  }catch{return[];}
}
export function clearWindowState():void{if(typeof window==="undefined")return;for(const k of [STORAGE_KEY,...LEGACY_KEYS])try{window.localStorage.removeItem(k)}catch{}}
