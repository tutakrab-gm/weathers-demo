"use client";
import dynamic from "next/dynamic";
import type { Pin } from "./MapView";
const MapView = dynamic(() => import("./MapView"), { ssr: false, loading: () => <div className="h-[360px] animate-pulse rounded-2xl bg-slate-200" /> });
export function MapClient({ pins, height }: { pins: Pin[]; height?: number }) { return <MapView pins={pins} height={height} />; }
