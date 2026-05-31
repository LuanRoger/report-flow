import * as embeddings from "./embeddings";
import * as measurements from "./measurements";

export const schemas = {
	...measurements,
	...embeddings,
};

export * from "./embeddings";
export * from "./measurements";
