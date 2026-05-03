(async () => {
  try {
    // Import dinámico del entrypoint ESM sin top-level await
    const { start } = await import('./src/index.js')
    await start()
  } catch (err) {
    console.error('Failed to start application (hostinger-start):', err)
    process.exit(1)
  }
})()
