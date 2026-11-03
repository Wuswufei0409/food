import { createRoot } from "react-dom/client";
import Home from "../app/page";
import Inbox from "./inbox";
import "../app/globals.css";
createRoot(document.getElementById("root")!).render(location.pathname.replace(/\/$/, "") === "/adam" ? <Inbox/> : <Home/>);
