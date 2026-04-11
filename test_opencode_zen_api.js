import axios from 'axios';
import https from 'https';

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
    
    const response = await axios.post(apiEndpoint, requestData, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      // 强制使用HTTPS
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });
    
    // 输出响应
    console.log('\nAPI测试成功!');
    console.log('响应状态码:', response.status);
    console.log('响应数据:');
    console.log(JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('\nAPI测试失败:');
    if (error.response) {
      // 服务器返回错误状态码
      console.error('状态码:', error.response.status);
      console.error('错误信息:', error.response.data);
    } else if (error.request) {
      // 请求已发送但没有收到响应
      console.error('未收到响应:', error.request);
    } else {
      // 请求配置出错
      console.error('请求配置错误:', error.message);
    }
  }
}

// 运行测试
testOpencodeZenAPI();