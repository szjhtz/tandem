// OpencodeZen API信息
const apiKey = 'sk-Boa7KONUjrGnibAnvXl0C5YqHfpUwY8rXB2YKr7Y2S8h5IvFqZBuJuEcDD6Okj4J';
const apiEndpoint = 'https://opencode.ai/zen/v1/chat/completions';
const model = 'minimax-m2.5-free';

// 测试函数
async function testOpencodeZenAPI() {
  try {
    console.log('开始测试 OpencodeZen API...');
    console.log('模型:', model);
    console.log('API端点:', apiEndpoint);
    
    // 构建请求数据
    const requestData = {
      model: model,
      messages: [
        {
          role: 'user',
          content: 'Hello, test message'
        }
      ],
      max_tokens: 50
    };
    
    // 发送请求
    console.log('发送请求...');
    console.log('请求数据:', JSON.stringify(requestData, null, 2));
    
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestData)
    });
    
    // 输出响应
    console.log('\nAPI测试结果:');
    console.log('响应状态码:', response.status);
    console.log('响应状态:', response.statusText);
    
    if (response.ok) {
      const data = await response.json();
      console.log('响应数据:');
      console.log(JSON.stringify(data, null, 2));
      console.log('\nAPI测试成功!');
    } else {
      const errorText = await response.text();
      console.error('API测试失败:');
      console.error('错误信息:', errorText);
    }
    
  } catch (error) {
    console.error('\nAPI测试失败:');
    console.error('错误信息:', error.message);
  }
}

// 运行测试
testOpencodeZenAPI();