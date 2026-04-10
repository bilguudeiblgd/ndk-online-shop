package excel

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"

	"github.com/xuri/excelize/v2"
)

// Mongolian phone: 8 digits starting with 6, 7, 8, 9
var phoneRegex = regexp.MustCompile(`\b([6-9]\d{7})\b`)

type FilterMode string

const (
	ModePriceOnly FilterMode = "price"
	ModePriceCode FilterMode = "price_code"
)

type TransactionStatus string

const (
	StatusAccepted  TransactionStatus = "Зөв"
	StatusBadPhone  TransactionStatus = "Утас олдсонгүй"
	StatusBadAmount TransactionStatus = "Дүн таарахгүй"
	StatusBadCode   TransactionStatus = "Код олдсонгүй"
	StatusNoMatch   TransactionStatus = "Бусад"
)

type Transaction struct {
	Date    string
	Branch  string
	Debit   float64
	Credit  float64
	Amount  float64 // absolute value of whichever is non-zero
	Balance float64
	Message string
	Account string
	// Extracted
	Phone   string
	HasCode bool
	Status  TransactionStatus
}

type FilterParams struct {
	Price float64
	Mode  FilterMode
	Code  string // required when Mode == ModePriceCode
}

type FilterResult struct {
	Accepted      []Transaction
	BadPhone      []Transaction
	BadAmount     []Transaction
	BadCode       []Transaction
	NoMatch       []Transaction
	Total         int
	AcceptedCount int
}

func FilterTransactions(fileBytes []byte, params FilterParams) (*FilterResult, []byte, error) {
	f, err := excelize.OpenReader(strings.NewReader(string(fileBytes)))
	if err != nil {
		return nil, nil, fmt.Errorf("XLSX нээж чадсангүй: %w", err)
	}
	defer f.Close()

	sheetName := f.GetSheetName(0)
	rows, err := f.GetRows(sheetName)
	if err != nil {
		return nil, nil, fmt.Errorf("мөр уншиж чадсангүй: %w", err)
	}

	// Find the header row
	headerIdx := -1
	for i, row := range rows {
		for _, cell := range row {
			if strings.Contains(cell, "Гүйлгээний огноо") {
				headerIdx = i
				break
			}
		}
		if headerIdx >= 0 {
			break
		}
	}
	if headerIdx < 0 {
		return nil, nil, fmt.Errorf("толгой мөр олдсонгүй ('Гүйлгээний огноо' агуулсан мөр)")
	}

	header := rows[headerIdx]
	colMap := mapColumns(header)

	var transactions []Transaction
	for i := headerIdx + 1; i < len(rows); i++ {
		row := rows[i]
		if len(row) == 0 {
			continue
		}

		t := Transaction{
			Date:    getCell(row, colMap["date"]),
			Branch:  getCell(row, colMap["branch"]),
			Debit:   parseFloat(getCell(row, colMap["debit"])),
			Credit:  parseFloat(getCell(row, colMap["credit"])),
			Balance: parseFloat(getCell(row, colMap["balance"])),
			Message: getCell(row, colMap["message"]),
			Account: getCell(row, colMap["account"]),
		}

		// Only incoming (credit) transactions — skip debits (outgoing)
		t.Amount = t.Credit
		if t.Amount <= 0 {
			continue
		}

		if t.Date == "" {
			continue
		}

		// Extract phone
		phones := phoneRegex.FindStringSubmatch(t.Message)
		if len(phones) > 1 {
			t.Phone = phones[1]
		}

		// Check code if needed
		if params.Mode == ModePriceCode && params.Code != "" {
			t.HasCode = strings.Contains(strings.ToLower(t.Message), strings.ToLower(params.Code))
		}

		// Determine status based on mode
		t.Status = classify(t, params)

		transactions = append(transactions, t)
	}

	result := &FilterResult{Total: len(transactions)}
	for _, t := range transactions {
		switch t.Status {
		case StatusAccepted:
			result.Accepted = append(result.Accepted, t)
			result.AcceptedCount++
		case StatusBadPhone:
			result.BadPhone = append(result.BadPhone, t)
		case StatusBadAmount:
			result.BadAmount = append(result.BadAmount, t)
		case StatusBadCode:
			result.BadCode = append(result.BadCode, t)
		default:
			result.NoMatch = append(result.NoMatch, t)
		}
	}

	output, err := generateOutput(result, params)
	if err != nil {
		return nil, nil, fmt.Errorf("гаралтын файл үүсгэж чадсангүй: %w", err)
	}

	return result, output, nil
}

func classify(t Transaction, p FilterParams) TransactionStatus {
	hasPhone := t.Phone != ""
	priceOK := amountMatch(t.Amount, p.Price)

	if p.Mode == ModePriceOnly {
		if hasPhone && priceOK {
			return StatusAccepted
		}
		if hasPhone && !priceOK {
			return StatusBadAmount
		}
		if !hasPhone && priceOK {
			return StatusBadPhone
		}
		// no phone + bad price
		return StatusNoMatch
	}

	// Price + Code mode
	hasCode := t.HasCode

	if hasPhone && priceOK && hasCode {
		return StatusAccepted
	}
	if hasPhone && priceOK && !hasCode {
		return StatusBadCode
	}
	if !hasPhone && priceOK && hasCode {
		return StatusBadPhone
	}
	if hasPhone && !priceOK && hasCode {
		return StatusBadAmount
	}
	// Worst cases: multiple things wrong
	if !hasPhone && !priceOK {
		return StatusNoMatch
	}
	if !hasCode && !priceOK {
		return StatusNoMatch
	}
	if !hasPhone {
		return StatusBadPhone
	}
	if !priceOK {
		return StatusBadAmount
	}
	return StatusNoMatch
}

func mapColumns(header []string) map[string]int {
	m := map[string]int{
		"date": -1, "branch": -1, "debit": -1,
		"credit": -1, "balance": -1, "message": -1, "account": -1,
	}
	for i, cell := range header {
		lower := strings.ToLower(strings.TrimSpace(cell))
		switch {
		case strings.Contains(lower, "огноо"):
			m["date"] = i
		case strings.Contains(lower, "салбар"):
			m["branch"] = i
		case strings.Contains(lower, "дебит"):
			m["debit"] = i
		case strings.Contains(lower, "кредит"):
			m["credit"] = i
		case strings.Contains(lower, "эцсийн"):
			m["balance"] = i
		case strings.Contains(lower, "утга"):
			m["message"] = i
		case strings.Contains(lower, "харьцсан"):
			m["account"] = i
		}
	}
	return m
}

func getCell(row []string, idx int) string {
	if idx < 0 || idx >= len(row) {
		return ""
	}
	return strings.TrimSpace(row[idx])
}

func parseFloat(s string) float64 {
	s = strings.ReplaceAll(s, ",", "")
	s = strings.ReplaceAll(s, " ", "")
	v, _ := strconv.ParseFloat(s, 64)
	return v
}

func amountMatch(credit, price float64) bool {
	return math.Abs(credit-price) < 1
}

func generateOutput(result *FilterResult, params FilterParams) ([]byte, error) {
	f := excelize.NewFile()
	defer f.Close()

	headerStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Color: "FFFFFF", Size: 11},
		Fill:      excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{"333333"}},
		Alignment: &excelize.Alignment{Horizontal: "center"},
	})
	greenStyle, _ := f.NewStyle(&excelize.Style{
		Fill: excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{"C6EFCE"}},
	})
	redStyle, _ := f.NewStyle(&excelize.Style{
		Fill: excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{"FFC7CE"}},
	})
	yellowStyle, _ := f.NewStyle(&excelize.Style{
		Fill: excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{"FFEB9C"}},
	})
	grayStyle, _ := f.NewStyle(&excelize.Style{
		Fill: excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{"D9D9D9"}},
	})

	headers := []string{"Огноо", "Утас", "Дүн", "Гүйлгээний утга", "Төлөв", "Харьцсан данс"}

	// Зөв
	f.SetSheetName("Sheet1", "Зөв")
	writeSheet(f, "Зөв", headers, result.Accepted, headerStyle, greenStyle)

	// Дүн таарахгүй
	if len(result.BadAmount) > 0 {
		f.NewSheet("Дүн таарахгүй")
		writeSheet(f, "Дүн таарахгүй", headers, result.BadAmount, headerStyle, redStyle)
	}

	// Код олдсонгүй (only in price+code mode)
	if len(result.BadCode) > 0 {
		f.NewSheet("Код олдсонгүй")
		writeSheet(f, "Код олдсонгүй", headers, result.BadCode, headerStyle, yellowStyle)
	}

	// Утас олдсонгүй
	if len(result.BadPhone) > 0 {
		f.NewSheet("Утас олдсонгүй")
		writeSheet(f, "Утас олдсонгүй", headers, result.BadPhone, headerStyle, redStyle)
	}

	// Таарахгүй
	if len(result.NoMatch) > 0 {
		f.NewSheet("Бусад")
		writeSheet(f, "Бусад", headers, result.NoMatch, headerStyle, grayStyle)
	}

	// Нэгтгэл
	summary := "Нэгтгэл"
	f.NewSheet(summary)
	row := 1
	setCellBold := func(a, b string) {
		f.SetCellValue(summary, fmt.Sprintf("A%d", row), a)
		f.SetCellValue(summary, fmt.Sprintf("B%d", row), b)
		row++
	}
	setCellNum := func(a string, b int) {
		f.SetCellValue(summary, fmt.Sprintf("A%d", row), a)
		f.SetCellValue(summary, fmt.Sprintf("B%d", row), b)
		row++
	}

	if params.Mode == ModePriceCode {
		setCellBold("Горим", "Үнэ + Код")
		setCellBold("Код", params.Code)
	} else {
		setCellBold("Горим", "Зөвхөн үнэ")
	}
	f.SetCellValue(summary, fmt.Sprintf("A%d", row), "Бүтээгдэхүүний үнэ")
	f.SetCellValue(summary, fmt.Sprintf("B%d", row), params.Price)
	row++
	setCellNum("Нийт гүйлгээ", result.Total)
	setCellNum("Зөв", len(result.Accepted))
	setCellNum("Дүн таарахгүй", len(result.BadAmount))
	if params.Mode == ModePriceCode {
		setCellNum("Код олдсонгүй", len(result.BadCode))
	}
	setCellNum("Утас олдсонгүй", len(result.BadPhone))
	setCellNum("Бусад", len(result.NoMatch))

	f.SetColWidth(summary, "A", "A", 25)
	f.SetColWidth(summary, "B", "B", 20)

	buf, err := f.WriteToBuffer()
	if err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func writeSheet(f *excelize.File, sheet string, headers []string, txns []Transaction, headerStyle, rowStyle int) {
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheet, cell, h)
		f.SetCellStyle(sheet, cell, cell, headerStyle)
	}
	for i, t := range txns {
		row := i + 2
		f.SetCellValue(sheet, fmt.Sprintf("A%d", row), t.Date)
		f.SetCellValue(sheet, fmt.Sprintf("B%d", row), t.Phone)
		f.SetCellValue(sheet, fmt.Sprintf("C%d", row), t.Amount)
		f.SetCellValue(sheet, fmt.Sprintf("D%d", row), t.Message)
		f.SetCellValue(sheet, fmt.Sprintf("E%d", row), string(t.Status))
		f.SetCellValue(sheet, fmt.Sprintf("F%d", row), t.Account)
		if rowStyle > 0 {
			f.SetCellStyle(sheet, fmt.Sprintf("A%d", row), fmt.Sprintf("F%d", row), rowStyle)
		}
	}
	f.SetColWidth(sheet, "A", "A", 20)
	f.SetColWidth(sheet, "B", "B", 12)
	f.SetColWidth(sheet, "C", "C", 15)
	f.SetColWidth(sheet, "D", "D", 40)
	f.SetColWidth(sheet, "E", "E", 18)
	f.SetColWidth(sheet, "F", "F", 20)
}
