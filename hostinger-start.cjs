(async () => {
  try {
    // Import dinámico del entrypoint ESM sin top-level await
    await import('./src/index.js')
  } catch (err) {
    console.error('Failed to start application (hostinger-start):', err)
    process.exit(1)
  }
})()
