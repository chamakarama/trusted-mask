# About the project

Mask filters personal and confidential information out of AI messages locally, with a simple goal: keep what the AI needs for your question and remove what it doesn’t.

People paste whole documents into chatbots to answer narrow questions. A customer-complaint summary needs the complaints, not every customer’s identity. A [2025 University of Melbourne and KPMG study](https://mbs.edu/-/media/PDF/Research/Trust_in_AI_Report.pdf?rev=0ee82285b2b0439bba524dbddc58214a#page=77) found that 48% of surveyed employees using AI at work reported uploading company information to public AI tools.

We developed privacy models specifically for this task, trained them on our own synthetic data, and built the complete filtering system around them. Our web demo runs the model on the user’s device before sending the filtered message to AI. The question provides context for deciding what belongs in that message.

Our hardest challenge is removing irrelevant sensitive information without losing useful facts. The newer models improve this, but reliability remains our next priority.

After the hackathon, we will bring Mask into existing AI tools through browser extensions and company integrations, making local privacy protection part of everyday AI use.
