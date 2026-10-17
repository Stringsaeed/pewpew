// The explainer runs in a browser: save.ts only needs AsyncStorage at call time, and the explainer never calls loadSave/writeSave.
const AsyncStorage = {
  getItem: async (_key: string): Promise<string | null> => null,
  setItem: async (_key: string, _value: string): Promise<void> => {},
};
export default AsyncStorage;
