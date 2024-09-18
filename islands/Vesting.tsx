import { useState, useEffect } from "preact/hooks";
import { Input } from "~/components/Input.tsx";
import { Button } from "~/components/Button.tsx";
import { Data, UTxO, Lucid } from "lucid/mod.ts";
import { readValidators } from "~/utils.ts";

interface VestingType {
    lucid: Lucid | null
}

type lockDurationType = {
    time: number;
    title: string;  
}[];

const lockDurations: lockDurationType = [
    {
        time: 3 * 60 * 1000,
        title: "Test (3 mins)"
    },
    {
        time: 3 * 60 * 60 * 1000,
        title: "3 hours"
    },
    {
        time: 3 * 24 * 60 * 60 * 1000,
        title: "3 days"
    },
    {
        time: 3 * 7 * 24 * 60 * 60 * 1000,
        title: "3 weeks"
    },
    {
        time: 12 * 7 * 24 * 60 * 60 * 1000,
        title: "3 months (12 wks)"
    },
];

const Datum = Data.Object({
    lock_until: Data.Integer(),
    owner: Data.Bytes(),
    beneficiary: Data.Bytes(),
});

type Datum = Data.Static<typeof Datum>;

export default function Vesting({ lucid }: VestingType) {
    const validators = readValidators();

    const [lockAdaAmount, setLockAdaAmount] = useState<string>("");
    const [lockAdaAddresses, setLockAdaAddresses] = useState<string>("");
    const [lockDuration, setLockDuration] = useState<string>("");
    const [utxoLockList, setUtxoLockList] = useState<UTxO[] | undefined>([]);
    const [locking, setLocking] = useState<boolean>(false);
    const [unlocking, setUnlocking] = useState<string | null>(null);
    const [lockTxHash, setLockTxHash] = useState<string | undefined>(undefined);
    const [unlockTxHash, setUnlockTxHash] = useState<string | undefined>(undefined);

    type lockTxDetailsType = {
        txHash: string | undefined;
        datumList: string[];
    }
    const [lockTxDetails, setLockTxDetails] = useState<lockTxDetailsType>({ txHash: "", datumList: [] });

    const lockDurationOptions = lockDurations.map(duration => (
        <option id={duration.title} value={duration.time}>{duration.title}</option>
    ));

    const handleLock = async () => {
        setLocking(true);

        try {
            const lockerHash = lucid!.utils.getAddressDetails(await lucid!.wallet.address())
                .paymentCredential!.hash;

            const contractAddress = lucid!.utils.validatorToAddress(validators.lock);

            const addressesArray = lockAdaAddresses.split(/[,\s]+/);

            const lockUntil = Number(lockDuration) + new Date().getTime();

            const datumList: string[] = [];

            for (let i = 0; i < addressesArray.length; i++) {
                const beneficiaryHash = lucid!.utils.getAddressDetails(addressesArray[i])
                    .paymentCredential!.hash;

                const datum = Data.to<Datum>(
                    {
                        lock_until: BigInt(lockUntil),
                        owner: lockerHash,
                        beneficiary: beneficiaryHash,
                    },
                    Datum
                );

                datumList.push(datum);
            }

            const lovelace = BigInt(Math.round((Number(lockAdaAmount) / datumList.length)) * 1000000);

            let tx = lucid?.newTx();

            datumList.forEach(datum => {
                tx = tx?.payToContract(contractAddress, { inline: datum }, { lovelace })
            });

            const txCompleted = await tx?.complete();

            const signedTx = await txCompleted?.sign().complete();
            const txHash = await signedTx?.submit();

            await lucid?.awaitTx(txHash!);

            console.log(`${lockAdaAmount} tADA locked into the contract`);
            setLockTxDetails(prevState => ({ ...prevState, txHash, datumList }));
            setLockTxHash(txHash);

            setLocking(false);
        } catch (err) {
            setLocking(false);
            console.log(err);
        }
    }

    const upDateLockList = async () => {
        const lockerHash = lucid!.utils.getAddressDetails(await lucid!.wallet.address())
            .paymentCredential!.hash;

        const scriptAddress = lucid!.utils.validatorToAddress(validators.lock);
        const scriptUtxos = await lucid?.utxosAt(scriptAddress);

        const utxos = scriptUtxos?.filter(utxo => {
            try {
                const datum = Data.from<Datum>(
                    utxo.datum!,
                    Datum
                );
                return datum.owner === lockerHash;
            } catch {
                return false;
            }
        });

        setUtxoLockList(utxos);
    };

    useEffect(() => {
        upDateLockList();
    }, [lockTxHash, unlocking]);

    const handleUnlock = async (txHashForUnlock: string) => {
        setUnlocking(txHashForUnlock);

        try {
            const walletHash = lucid!.utils.getAddressDetails(await lucid!.wallet.address())
                .paymentCredential!.hash;

            const scriptAddress = lucid!.utils.validatorToAddress(validators.lock);
            const scriptUtxos = await lucid?.utxosAt(scriptAddress);

            const utxos = scriptUtxos!.filter(utxo => {
                try {
                    const datum = Data.from<Datum>(
                        utxo.datum!,
                        Datum
                    );
                    return (datum.owner === walletHash || datum.beneficiary === walletHash) && utxo.txHash === txHashForUnlock;
                } catch {
                    return false;
                }
            });

            let validFrom = Date.now() - 100000;
            validFrom = validFrom - (validFrom % 1000);

            const tx = await lucid?.newTx()
                .collectFrom(utxos, Data.void())
                .addSigner(await lucid.wallet.address())
                .validFrom(validFrom)
                .attachSpendingValidator(validators.lock)
                .complete();

            const signedTx = await tx?.sign().complete();
            const txHash = await signedTx?.submit();

            await lucid?.awaitTx(txHash!);

            setUnlockTxHash(txHash);

            // remove
            console.log(`${lockAdaAmount} tADA unlocked!`);

            setUnlocking(null);
        } catch (err) {
            setUnlocking(null);
            console.log(err);
        }
    };

    return (
        <>
            <h2 class="mt-10 text-lg font-bold">Vest ADA</h2>

            <Input
                type="text"
                name="lockAdaAmount"
                id="lockAdaAmount"
                value={lockAdaAmount}
                onInput={e => setLockAdaAmount(e.currentTarget.value)}
            >
                Ada Amount to Vest
            </Input>

            <label
                htmlFor="lockDuration"
                class="block mt-4 mb-3 text-sm font-medium text-gray-700"
            >Vesting Duration</label>
            <select
                id="lockDuration"
                value={lockDuration}
                onChange={e => setLockDuration(e.currentTarget.value)}
                class="bg-gray-50 my-4 block border rounded-md h-8"
            >
                <option value=""></option>
                {lockDurationOptions}
            </select>

            <Input
                type="text"
                name="lockAdaAddresses"
                id="lockAdaAddresses"
                value={lockAdaAddresses}
                onInput={e => setLockAdaAddresses(e.currentTarget.value)}
            >
                Addresses to distribute ADA to (comma separated)
            </Input>

            <Button
                class="my-4"
                onClick={handleLock}
                disabled={locking}
            >
                {locking ? "Vesting..." : "Vest"}
            </Button>

            {lockTxDetails.txHash &&
                <div class="mb-8 mt-4 text-center">
                    <p><span class="font-semibold">ADA locked!;</span> Transaction hash: <a
                        target="_blank"
                        class="text-blue-400"
                        href={`https://preprod.cardanoscan.io/transaction/${lockTxDetails.txHash}`}
                    >{lockTxDetails.txHash}</a></p>
                    <p>Datum(s): <br /> {lockTxDetails.datumList.map((datum) => (
                        <pre class="bg-gray-200 p-2 rounded overflow-auto max-w-screen-sm">{datum}</pre>
                    ))}</p>
                </div>
            }

            {!!utxoLockList?.length &&
                (<>
                    <h2 class="mt-4 text-lg font-semibold">List of Locked ADA</h2>
                    {unlockTxHash && 
                        <p>ADA Unlocked!; Transaction hash: <a
                            target="_blank"
                            class="text-blue-400 my-3"
                            href={`https://preprod.cardanoscan.io/transaction/${unlockTxHash}`}
                        >{unlockTxHash}</a></p>
                    }
                    <div class="mt-2">
                        {utxoLockList.map((utxo, key) => {
                            const datum = Data.from<Datum>(
                                utxo.datum!,
                                Datum
                            );

                            let timeLeftMins = (Number(datum?.lock_until) - new Date().getTime()) / (1000 * 60);
                            timeLeftMins = timeLeftMins >= 0 ? timeLeftMins : 0
                            timeLeftMins = Number(timeLeftMins.toFixed(3));

                            console.log(`key: ${key}`);

                            return (
                                <p key={key} class="flex flex-row gap-6 mt-2 align-middle">
                                    <div>Amount locked: {(Number(utxo.assets.lovelace) / 1000000).toFixed(2)} tADA</div>
                                    <div>Time left: {timeLeftMins} mins</div>
                                    <div>Address locked to: {lucid?.utils.credentialToAddress(lucid?.utils.keyHashToCredential(datum.beneficiary))}</div>
                                    <div>
                                        <Button
                                            onClick={() => handleUnlock(utxo.txHash)}
                                            id={String(key)}
                                            disabled={!!timeLeftMins || unlocking === utxo.txHash}
                                        >
                                            {unlocking === utxo.txHash ? "Unlocking..." : "Unlock"}
                                        </Button>
                                    </div>
                                </p>
                        )})}
                    </div>
                </>)
            }
        </>
    );
}