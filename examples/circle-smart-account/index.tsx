import * as React from "react";
import * as ReactDOM from "react-dom/client";
import { polygonAmoy, arcTestnet } from "viem/chains";

import { type Hex, createPublicClient, parseUnits } from "viem";
import {
	type P256Credential,
	type SmartAccount,
	WebAuthnAccount,
	createBundlerClient,
	toWebAuthnAccount,
} from "viem/account-abstraction";
import {
	WebAuthnMode,
	toCircleSmartAccount,
	toModularTransport,
	toPasskeyTransport,
	toWebAuthnCredential,
	encodeTransfer,
	ContractAddress,
} from "@circle-fin/modular-wallets-core";

const clientKey = import.meta.env.VITE_CLIENT_KEY as string;
const clientUrl = import.meta.env.VITE_CLIENT_URL as string;

const USDC_DECIMALS = 6;
// 対象のチェーン
const CHAIN = "arcTestnet";

// Create Circle transports
const passkeyTransport = toPasskeyTransport(clientUrl, clientKey);
const modularTransport = toModularTransport(`${clientUrl}/${CHAIN}`, clientKey);

// Create a public client
const client = createPublicClient({
	chain: arcTestnet,
	transport: modularTransport,
});

// Create a bundler client
const bundlerClient = createBundlerClient({
	chain: arcTestnet,
	transport: modularTransport,
});

/**
 * Example Component
 */
function Example() {
	const [account, setAccount] = React.useState<SmartAccount>();
	const [credential, setCredential] = React.useState<P256Credential>(() =>
		JSON.parse(localStorage.getItem("credential") || "null"),
	);
	const [username, setUsername] = React.useState<string | undefined>(
		() => localStorage.getItem("username") || undefined,
	);

	const [hash, setHash] = React.useState<Hex>();
	const [userOpHash, setUserOpHash] = React.useState<Hex>();

	React.useEffect(() => {
		// パスキー認証用のクレデンシャル情報がない場合は、パスキー認証の登録とスマートウォレットを作成する
		if (!credential) return;

		// Create a circle smart account
		toCircleSmartAccount({
			client,
			owner: toWebAuthnAccount({ credential }) as WebAuthnAccount,
			name: username,
		}).then(setAccount);
	}, [credential]);

	/**
	 * 登録用のメソッド
	 */
	const register = async () => {
		const username = (document.getElementById("username") as HTMLInputElement)
			.value;
		// パスキー認証の登録
		const credential = await toWebAuthnCredential({
			transport: passkeyTransport,
			mode: WebAuthnMode.Register,
			username,
		});
		// ブラウザのローカルストレージに保管する
		localStorage.setItem("credential", JSON.stringify(credential));
		localStorage.setItem("username", username);
		setCredential(credential);
		setUsername(username);
	};

	/**
	 * 認証用のメソッド
	 */
	const login = async () => {
		// パスキー認証でログインするメソッド
		const credential = await toWebAuthnCredential({
			transport: passkeyTransport,
			mode: WebAuthnMode.Login,
		});
		// 認証情報をローカルストレージに保管する
		localStorage.setItem("credential", JSON.stringify(credential));
		setCredential(credential);
	};	

	/**
	 * ユーザーオペレーションを作成＆送信するメソッド
	 */
	const sendUserOperation = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!account) return;

		// 宛先ウォレットアドレスと送金額を指定する
		const formData = new FormData(event.currentTarget);
		const to = formData.get("to") as `0x${string}`;
		const value = formData.get("value") as string;

		// Create callData for USDC transfer
		const callData = encodeTransfer(
			to,
			ContractAddress.PolygonAmoy_USDC,
			parseUnits(value, USDC_DECIMALS),
		);	
		
		// ユーザーオペレーションを作成
		const hash = await bundlerClient.sendUserOperation({
			account,
			calls: [callData],
			paymaster: true,
		});
		setUserOpHash(hash);

		// 送金する
		const { receipt } = await bundlerClient.waitForUserOperationReceipt({
			hash,
		});
		setHash(receipt.transactionHash);
	};

	if (!credential)
		return (
			<>
				<input id="username" name="username" placeholder="Username" />
				<br />
				<button onClick={register}>Register</button>
				<button onClick={login}>Login</button>
			</>
		);
	if (!account) return <p>Loading...</p>;

	return (
		<>
			<h2>Account</h2>
			<p>Address: {account?.address}</p>

			<h2>Send User Operation</h2>
			<form onSubmit={sendUserOperation}>
				<input name="to" placeholder="Address" />
				<input name="value" placeholder="Amount (USDC)" />
				<button type="submit">Send</button>
				{userOpHash && <p>User Operation Hash: {userOpHash}</p>}
				{hash && <p>Transaction Hash: {hash}</p>}
			</form>
		</>
	);
}

// root要素にExample コンポーネントをレンダリング
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<Example />,
);
