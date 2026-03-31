#!/usr/bin/env bun
/**
 * item-class.ts — List item classes, get a class, or get a subclass
 *
 * Usage:
 *   ./run src/item-class.ts [--pretty]                         # list all classes
 *   ./run src/item-class.ts --id 2 [--pretty]                  # get class details
 *   ./run src/item-class.ts --id 2 --subclass 5 [--pretty]     # get subclass details
 */

import { WoWAPI } from "./api.ts";
import { getArg, hasFlag, output } from "./utils.ts";

const id = getArg("--id");
const subclass = getArg("--subclass");
const pretty = hasFlag("--pretty");

try {
  const api = new WoWAPI(getArg("--region") ?? "us");

  let data: any;
  if (id && subclass) {
    data = await api.getItemSubclass(parseInt(id, 10), parseInt(subclass, 10));
  } else if (id) {
    data = await api.getItemClass(parseInt(id, 10));
  } else {
    data = await api.getItemClassesIndex();
  }

  output(data, pretty);
} catch (err: any) {
  console.error(JSON.stringify({ error: err.message ?? String(err) }));
  process.exit(1);
}
