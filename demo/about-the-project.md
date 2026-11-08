# About the project

Mask filters personal and confidential information out of AI messages locally, with a simple goal: keep what the AI needs for your question and remove what it doesn’t.

People paste whole documents into chatbots to answer narrow questions. A customer-complaint summary needs the complaints, not every customer’s identity. A [2025 University of Melbourne and KPMG study](https://mbs.edu/-/media/PDF/Research/Trust_in_AI_Report.pdf?rev=0ee82285b2b0439bba524dbddc58214a#page=77) found that 48% of surveyed employees using AI at work reported uploading company information to public AI tools.

We trained DeBERTa models on our own annotated synthetic data to detect sensitive information and assess its relevance to the question, then combined their predictions with deterministic editing rules. We also built a lightweight custom classifier, selecting DeBERTa after stronger identifier-removal results in our checks. Inference runs locally in the browser through ONNX Runtime and WebAssembly; a local mapping can restore names in AI replies without sharing the originals.

Our hardest challenge is removing irrelevant sensitive information without losing useful facts. The newer models improve this, but reliability remains our next priority.

After the hackathon, we will bring Mask into existing AI tools through browser extensions and company integrations, making local privacy protection part of everyday AI use.
