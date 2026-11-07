# Mask demo video — script 1.0

7 November 2026. Approximately 2–3 minutes, including pauses for the demo.

Demo inputs:

- [Personal health message](personal-health-message.txt)
- [Corporate support message](corporate-support-message.txt)

All people and records in these inputs are fictional. The medical scene is an illustrative storyboard; record the actual application workflow for the corporate scene. The transformations below describe the intended demo, not verified outputs or measured performance.

## Script

*[You on camera. Deadpan.]*

> Sam Altman doesn’t need to know about my itchy ass.
>
> I just wanted to understand my runny-nose medicine—and why I was prescribed it.
>
> But if I paste my whole medical record into an AI chatbot, that unrelated detail about my ass can go along with it. Along with my name, patient number, and everything else in the document.

*[Show the fictional medical record beside the question. Caption: “Illustrative example — synthetic data.”]*

> The question needs a few details. The document contains my life story.
>
> We’re building Mask to separate them.

*[Reveal Mask. Illustrate the medicine name and relevant runny-nose visit staying while patient identifiers and unrelated visits disappear.]*

> Mask is a local privacy layer between you and the AI tools you use.
>
> It uses your task to help decide what information to keep, what to remove, and what to make less specific—before you share it.
>
> For this question, keep the medicine’s name and the symptoms recorded at that visit. Remove my patient number and the unrelated personal notes.

*[Back to camera, then transition into the actual application.]*

> Now replace my medical record with your company’s customer conversations.
>
> An employee wants to ask AI: “What are our customers complaining about, and what should we improve?”
>
> They have a spreadsheet of support conversations. But alongside the complaints are customer names, email addresses, and personal details.
>
> The AI needs to understand the problems. It doesn’t need to know who had them.

*[Import the synthetic customer-service spreadsheet into Mask. Enter the question and specify that an external AI chatbot will receive the data.]*

> We give Mask the spreadsheet and explain what we want to do.
>
> Mask processes the data locally in the browser, and we review exactly what changes.

*[Zoom into one readable before-and-after example.]*

> The complaint about being charged twice stays. The customer’s name and email are masked.
>
> We keep the information needed to understand the complaint, while reducing unnecessary exposure.

*[Export the protected spreadsheet, attach it to the chatbot, and ask the original question. Show its actual response.]*

> Now we give the protected version to the chatbot.
>
> We can still get a useful breakdown of customer problems—and suggestions for improving support—without including those customer identifiers.

*[Return to camera, then the Mask end card.]*

> Whether it’s your medical record or your company’s customer data, your AI needs context. Be intentional about how much you give it.
>
> **Mask. Share what’s needed. Keep the rest private.**

## Recording notes

- The two message files contain the raw, oversharing inputs. Show only the reviewed, protected version going to the external chatbot.
- For the health illustration, retain cetirizine, the runny nose and sneezing, and relevant visit notes. The record lists symptoms and a prescription; it does not establish a diagnosis or the clinician’s complete reasoning. The chatbot should distinguish what the record says from general information about the medicine.
- For the corporate import, copy the CSV section of `corporate-support-message.txt` (starting at `customer_id,customer_name,email,complaint`) into a CSV file. Use the question above it as the task description and identify the recipient as an external AI chatbot.
- Review names, emails and customer IDs in both columns and complaint text. Intended retained complaint counts: duplicate charges **3**, delayed refunds **2**, password-reset problem **1**. These are answer checks, not measured Mask results.
- Record the real import → review → export → chatbot attachment sequence. Use the actual chatbot response for the closing demonstration.
