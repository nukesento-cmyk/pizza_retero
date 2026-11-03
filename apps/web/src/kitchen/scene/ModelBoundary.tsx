"use client";

import { Component, type ReactNode } from "react";

/** If a GLB fails to load or parse, render the procedural stand-in instead of breaking the scene. */
export class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override componentDidCatch(e: unknown) { console.warn("[kitchen] model failed, using procedural fallback", e); }
  override render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
