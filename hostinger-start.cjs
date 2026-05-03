(async () => {
  try {
    console.log('[hostinger-start.cjs] Iniciando aplicación...')
    console.log('[hostinger-start.cjs] Importando src/index.js')
    
    // Import dinámico del entrypoint ESM sin top-level await
    const { start } = await import('./src/index.js')
    
    console.log('[hostinger-start.cjs] Función start importada correctamente')
    console.log('[hostinger-start.cjs] Llamando a start()...')
    
    await start()
    
    console.log('[hostinger-start.cjs] Aplicación iniciada exitosamente')
  } catch (err) {
    console.error('[hostinger-start.cjs] ERROR:', err.message)
    console.error('[hostinger-start.cjs] Stack:', err.stack)
    process.exit(1)
  }
})()
