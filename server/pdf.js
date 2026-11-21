import PDFDocument from "pdfkit";
import { fileURLToPath } from "node:url";

const types = { CAMISA: "Camisa", CALCA: "Calça", SAPATO: "Sapato" };
export function makePdf(data, { logoPath = "" } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 48, bottom: 48, left: 48, right: 48 },
      bufferPages: true,
      info: { Title: "Encaminhamento ao DEP", Author: "ADAM — IFAM" },
    });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    try {
      doc.registerFont(
        "Body",
        fileURLToPath(new URL("./assets/DejaVuSans.ttf", import.meta.url)),
      );
      doc.registerFont(
        "Bold",
        fileURLToPath(new URL("./assets/DejaVuSans-Bold.ttf", import.meta.url)),
      );
      const date = (s) =>
        new Intl.DateTimeFormat("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: data.instituicao.fusoHorario,
        }).format(new Date(s));
      const section = (text) => {
        if (doc.y > 700) doc.addPage();
        doc.moveDown(0.5).font("Bold").fontSize(12).text(text);
        doc.font("Body").fontSize(10);
      };
      if (logoPath) {
        doc.image(logoPath, 48, 48, { fit: [110, 60] });
        doc.moveDown(5);
      }
      doc
        .fillColor("#28633d")
        .font("Bold")
        .fontSize(14)
        .text("INSTITUTO FEDERAL DO AMAZONAS");
      doc
        .fillColor("#24382e")
        .font("Body")
        .fontSize(10)
        .text(data.instituicao.campus)
        .moveDown();
      doc.font("Bold").fontSize(20).text("Encaminhamento ao DEP").moveDown(0.5);
      doc
        .font("Body")
        .fontSize(10)
        .text(`Identificador: ${data.encaminhamento.id}`)
        .text(`Ano letivo: ${data.encaminhamento.anoLetivo}`);
      const a = data.snapshot.aluno;
      section("Identificação do estudante");
      doc
        .text(a.nome)
        .text(`Matrícula: ${a.matricula}`)
        .text(`Curso: ${a.curso} · Turma: ${a.turma}`)
        .moveDown();
      doc.text(
        "O estudante atingiu três ocorrências no ano letivo indicado. Seguem os registros que motivaram o encaminhamento para acompanhamento pelo DEP.",
      );
      data.snapshot.ocorrencias.forEach((o, i) => {
        const height =
          doc.heightOfString(
            `Observação: ${o.observacao || "Sem observação."}`,
            { lineGap: 3 },
          ) + 100;
        if (
          doc.y + height > doc.page.height - 60 &&
          height < doc.page.height - 110
        )
          doc.addPage();
        section(`${i + 1}. Abordagem de ${date(o.dataHoraAbordagem)}`);
        doc.text(
          JSON.parse(o.irregularidadesJson)
            .map((t) => `${types[t]} fora do padrão`)
            .join("; "),
        );
        doc.text(`Observação: ${o.observacao || "Sem observação."}`, {
          lineGap: 3,
        });
        doc
          .text(
            `Assistente: ${o.assistenteNome || "Responsável não identificado"}`,
          )
          .moveDown();
      });
      if (doc.y > 650) doc.addPage();
      doc
        .moveDown()
        .text(`Emitido em ${date(data.emitidoEm)} por ${data.emitidoPor}.`);
      doc
        .moveDown(3)
        .text("________________________________________", { align: "center" })
        .text("Assinatura do responsável", { align: "center" });
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        const bottom = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc
          .font("Body")
          .fontSize(8)
          .fillColor("#68786d")
          .text(
            `ADAM · IFAM     |     Página ${i + 1} de ${range.count}`,
            48,
            doc.page.height - 35,
            { lineBreak: false, align: "center", width: 499 },
          );
        doc.page.margins.bottom = bottom;
      }
      doc.end();
    } catch (e) {
      doc.destroy();
      reject(e);
    }
  });
}
