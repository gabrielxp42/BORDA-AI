import { sendEvolutionText } from './src/services/whatsappService.ts';

async function testWhatsApp() {
  const testPhone = '5511999999999'; 
  const testMessage = 'Teste de auditoria Borda-AI';

  console.log(`Iniciando teste...`);
  
  try {
    const result = await sendEvolutionText(testPhone, testMessage);
    console.log('✅ Resultado:', result);
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

testWhatsApp();
