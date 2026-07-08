"use client";

import React from "react";
import ToastProvider from "@/components/ui/ToastProvider";

export const ToastWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <ToastProvider>{children}</ToastProvider>;
};

export default ToastWrapper;
