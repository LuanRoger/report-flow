import * as measurements from "./measurements";
import * as embeddings from "./embeddings";

export const schemas = {
	...measurements,
	...embeddings,
};

export * from "./measurements";
export * from "./embeddings";
