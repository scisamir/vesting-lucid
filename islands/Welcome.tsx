import { Blockfrost, Lucid, type WalletApi } from "lucid/mod.ts";
import { useEffect, useState } from "preact/hooks";
import { Button } from "../components/Button.tsx";
import Vesting from "~/islands/Vesting.tsx";

export default function Welcome() {
    const [lucid, setLucid] = useState<Lucid | null>(null);
    const [userWallet, setUserWallet] = useState<WalletApi | null>(null);

    const setUpLucid = async (e: Event) => {
        e.preventDefault();

        const blockfrostID = "preprod4XNNKV7AtEG8EjLc0kDwdIVoIVLx1x3F";

        const newLucid = await Lucid.new(
            new Blockfrost(
                "https://cardano-preprod.blockfrost.io/api/v0",
                blockfrostID
            ),
            "Preprod"
        );

        setLucid(newLucid);

        // log to be removed
        console.log("Lucid:");
        console.log(lucid);
    };

    useEffect(() => {
        if (lucid) {
            window.cardano.eternl.enable().then((wallet) => {
                lucid.selectWallet(wallet);
                setUserWallet(wallet);
            });
        }
    }, [lucid]);

    return (
        <>
            <div class="mt-10 grid grid-cols-1 gap-y-8">
                <Button onClick={setUpLucid} disabled={userWallet ? true  : false}>{userWallet ? "Connected" : "Connect Wallet"}</Button>
            </div>
            {userWallet && (
                <Vesting lucid={lucid} />
            )}
        </>
    );
}