// Next.js App Router convention: app/not-found.js is rendered automatically
// for any unmatched route, both in dev and in `next start`.
export default function NotFound() {
	return (
		<html lang="en">
			<head>
				<title>Page not found</title>
				<meta name="robots" content="noindex" />
			</head>
			<body>
				<h1>Page not found</h1>
				<p>This page doesn't exist — it may have moved or been renamed.</p>
				<ul>
					<li><a href="/">Home</a></li>
				</ul>
			</body>
		</html>
	);
}
