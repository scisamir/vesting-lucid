import { applyDoubleCborEncoding, SpendingValidator } from "lucid/mod.ts";
import blueprint from "~/plutus.json" with { type: "json" };

// Returns the staking validator
export type Validators = {
    lock: SpendingValidator;
}

export function readValidators(): Validators {
    const stake = blueprint.validators.find(v => v.title === "stake.stake.spend");

    if (!stake) {
        throw new Error("Stake validator not found");
    }

    return {
        lock: {
            type: "PlutusV2",
            script: applyDoubleCborEncoding(stake.compiledCode)
        },
    };
}